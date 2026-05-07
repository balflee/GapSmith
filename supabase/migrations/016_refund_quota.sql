-- Quota refund mechanism for upstream-LLM-failure path.
--
-- Background:
--   /api/{forge,prove,scout}/start consumes quota BEFORE dispatching the
--   engine background task. If the engine then fails because the upstream
--   provider returned 503/529/rate-limit/network error, the user just lost
--   1 of their N annual runs for something they had no control over and
--   received no deliverable for. The engine now classifies these failures
--   and calls refund_quota to put the unit back atomically.
--
-- Why a dedicated RPC instead of `UPDATE ... SET used_count = used_count - 1`:
--   - Need row lock symmetry with consume_quota (avoids races)
--   - Need to pick the SAME counter consume_quota likely picked
--     (earliest-expiring active row) so refunds don't drift to a wrong
--     counter when a user has multiple purchases stacking quota
--   - Need defensive floor at 0 (CHECK constraint enforces but a refund
--     with no prior consume should be a no-op, not a 23514 error)
--   - Need structured return for engine logging + future ops dashboards
--
-- Caller contract:
--   Engine background task wraps run_ideation/run_debate/run_scout in
--   try/except. On a classified upstream error (litellm
--   ServiceUnavailableError / RateLimitError / APIConnectionError /
--   Timeout / InternalServerError / anthropic OverloadedError), call
--   storage.refund_quota(user_id, sku). Other failure classes
--   (validator quality-warning, parsing bugs, our orchestration bugs)
--   do NOT refund — those are delivered runs (imperfect) or our fault to
--   investigate, not user-blameless upstream outages.

CREATE OR REPLACE FUNCTION refund_quota(
  user_id_in uuid,
  sku_in text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  picked_id uuid;
  picked_used integer;
  picked_total integer;
  picked_period_end timestamptz;
BEGIN
  -- Mirror consume_quota's selection: earliest-expiring active counter
  -- where there's actually something to refund. Lock the row so a
  -- concurrent consume_quota on the same counter sees the post-decrement
  -- state instead of racing.
  SELECT id, used_count, quota_total, period_end
    INTO picked_id, picked_used, picked_total, picked_period_end
  FROM usage_counters
  WHERE user_id = user_id_in
    AND sku = sku_in
    AND now() BETWEEN period_start AND period_end
    AND used_count > 0
  ORDER BY period_end ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF picked_id IS NULL THEN
    -- Nothing to refund: either no active counter, or every active
    -- counter is already at 0. Return ok:false so the caller can log it
    -- but don't error — refund is a best-effort recovery, not a
    -- correctness guarantee.
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'nothing_to_refund',
      'sku', sku_in
    );
  END IF;

  UPDATE usage_counters
    SET used_count = used_count - 1
  WHERE id = picked_id;

  RETURN jsonb_build_object(
    'ok', true,
    'used', picked_used - 1,
    'total', picked_total,
    'remaining', picked_total - picked_used + 1,
    'period_end', picked_period_end,
    'sku', sku_in,
    'counter_id', picked_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION refund_quota(uuid, text) TO service_role;

COMMENT ON FUNCTION refund_quota IS
  'Atomically refund one quota unit (used by engine on upstream LLM failure). Returns {ok, used, total, remaining, period_end} on success or {ok:false, reason:nothing_to_refund} when nothing to refund. service_role only — never call from user-facing code.';
