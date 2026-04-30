-- Phase 2 of Colosseum hackathon plan:
-- Hybrid lifetime + 365-day rolling quota. Each purchase snapshots an annual
-- usage allowance. Quota exhaustion routes the user to Done-For-You upsell
-- (handled at app layer); we just gate the run-start endpoints here.

-- ================================================================
-- usage_counters — per-purchase usage tracking
-- One row per (purchase, sku). Bundle and CLI purchases create THREE
-- rows (scout/forge/prove) tied to the same purchase_id.
-- ================================================================
CREATE TABLE IF NOT EXISTS usage_counters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  sku text NOT NULL CHECK (sku IN ('scout', 'forge', 'prove')),
  period_start timestamptz NOT NULL DEFAULT now(),
  period_end timestamptz NOT NULL,
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  quota_total integer NOT NULL CHECK (quota_total > 0),
  purchase_id uuid REFERENCES purchases(id) ON DELETE CASCADE,
  -- One row per (purchase, sku) — bundle creates 3 rows under same purchase_id
  UNIQUE(purchase_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_user_sku
  ON usage_counters(user_id, sku);

CREATE INDEX IF NOT EXISTS idx_usage_counters_active
  ON usage_counters(user_id, sku, period_end)
  WHERE used_count < quota_total;

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_counters_select_own" ON usage_counters;
CREATE POLICY "usage_counters_select_own" ON usage_counters
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "usage_counters_service_role" ON usage_counters;
CREATE POLICY "usage_counters_service_role" ON usage_counters
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE usage_counters IS
  'Per-purchase 365-day rolling quota. Used by start routes to gate runs; bundle/CLI purchases create 3 rows.';

-- ================================================================
-- consume_quota(user_id, sku) — atomic increment + return state
-- Picks the earliest-expiring active counter and increments it under
-- a row lock. Falls back to {ok:false, reason:'quota_exhausted'} when
-- no active counter exists.
--
-- Caller (API route) uses this result to either:
--   - run the pipeline (ok:true)
--   - return 402 with upsell pointer to /pricing#done-for-you (ok:false)
-- ================================================================
CREATE OR REPLACE FUNCTION consume_quota(
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
  agg_used integer;
  agg_total integer;
BEGIN
  -- Acquire earliest-expiring active counter, lock the row to prevent
  -- concurrent over-spend. SKIP LOCKED lets parallel callers find a
  -- different counter when one is mid-update (rare, but correct).
  SELECT id, used_count, quota_total, period_end
    INTO picked_id, picked_used, picked_total, picked_period_end
  FROM usage_counters
  WHERE user_id = user_id_in
    AND sku = sku_in
    AND now() BETWEEN period_start AND period_end
    AND used_count < quota_total
  ORDER BY period_end ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF picked_id IS NULL THEN
    -- No active quota row. Return aggregate state so caller can show
    -- a useful "you've used X/Y this year" message.
    SELECT
      COALESCE(SUM(used_count), 0)::integer,
      COALESCE(SUM(quota_total), 0)::integer
    INTO agg_used, agg_total
    FROM usage_counters
    WHERE user_id = user_id_in AND sku = sku_in;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'quota_exhausted',
      'used', agg_used,
      'total', agg_total,
      'sku', sku_in
    );
  END IF;

  UPDATE usage_counters
    SET used_count = used_count + 1
  WHERE id = picked_id;

  RETURN jsonb_build_object(
    'ok', true,
    'used', picked_used + 1,
    'total', picked_total,
    'remaining', picked_total - picked_used - 1,
    'period_end', picked_period_end,
    'sku', sku_in,
    'counter_id', picked_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION consume_quota(uuid, text) TO service_role, authenticated;

COMMENT ON FUNCTION consume_quota IS
  'Atomically consume one quota unit. Returns {ok, used, total, remaining, period_end} on success or {ok:false, reason:quota_exhausted, used, total} when capped.';
