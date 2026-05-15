-- Free-trial signup quota — auto-grants 1 Scout + 1 Forge + 1 Prove to every
-- user when they verify their email. Drives the /free-trial Google Ads
-- acquisition funnel: visitor signs up, confirms email, immediately gets 3
-- runs without paying or providing an LLM key (engine routes detect the
-- trial-only state and inject the company's MiniMax key server-side).
--
-- Design (mirrors the existing paid-purchase pattern as closely as possible):
--   - Each trial entitlement is a synthetic `purchases` row with
--     payment_method='trial' and amount_cents=0. This keeps userOwnsSku()
--     and the bonding-curve quota system entirely unchanged.
--   - Each purchase row gets its own usage_counters row with quota_total=1
--     and a 365-day period (same as paid). After 1 successful run, the
--     existing consume_quota RPC returns quota_exhausted on subsequent
--     attempts, which the start routes already translate into a 402 +
--     /pricing redirect.
--   - Trigger fires on email verification (NULL → NOT NULL on
--     auth.users.email_confirmed_at). Anyone who signs up without
--     confirming their email gets nothing — that's the anti-abuse hook.
--   - Also handles INSERT-with-confirmed case (Google OAuth, where Google
--     vouches for the email and Supabase inserts the row already verified).
--   - Idempotent: re-firing the trigger (or manually calling the function)
--     never grants duplicate trial quota — guarded by checking for an
--     existing trial purchase row.

-- ================================================================
-- grant_trial_quota_for_user(uid)
-- Inserts 3 (purchases, usage_counters) pairs for the given user, one per
-- pipeline. No-op if user already has any payment_method='trial' purchase.
-- ================================================================
CREATE OR REPLACE FUNCTION grant_trial_quota_for_user(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  s text;
BEGIN
  -- Idempotency guard. The "any trial purchase" check is intentionally
  -- broad: if even one of the three sku rows already exists, we treat the
  -- whole grant as done. (We never partially grant — the loop below is
  -- atomic per-user via SECURITY DEFINER + the function being called from
  -- a single trigger fire per row.)
  IF EXISTS (
    SELECT 1 FROM purchases
    WHERE user_id = uid AND payment_method = 'trial'
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  FOREACH s IN ARRAY ARRAY['scout', 'forge', 'prove'] LOOP
    INSERT INTO purchases (user_id, sku, amount_cents, payment_method)
    VALUES (uid, s, 0, 'trial')
    RETURNING id INTO pid;

    INSERT INTO usage_counters (
      user_id, sku, period_start, period_end,
      used_count, quota_total, purchase_id
    )
    VALUES (
      uid, s, now(), now() + interval '365 days',
      0, 1, pid
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION grant_trial_quota_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_trial_quota_for_user(uuid) TO service_role;

COMMENT ON FUNCTION grant_trial_quota_for_user IS
  'Idempotent: grants 1 Scout + 1 Forge + 1 Prove trial quota to a user. Called by trigger on email verification.';

-- ================================================================
-- on_auth_user_email_verified — trigger function
-- Two firing conditions:
--   1. INSERT with email_confirmed_at already non-null (OAuth signup)
--   2. UPDATE flipping email_confirmed_at from NULL to non-null (email
--      confirmation link click)
-- Anything else is a no-op.
-- ================================================================
CREATE OR REPLACE FUNCTION on_auth_user_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.email_confirmed_at IS NOT NULL) THEN
    PERFORM grant_trial_quota_for_user(NEW.id);
  ELSIF (TG_OP = 'UPDATE'
         AND OLD.email_confirmed_at IS NULL
         AND NEW.email_confirmed_at IS NOT NULL) THEN
    PERFORM grant_trial_quota_for_user(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER trigger so the auth.users row is guaranteed to exist when the
-- grant runs (purchases.user_id FK would fail in BEFORE).
DROP TRIGGER IF EXISTS on_auth_user_email_verified ON auth.users;
CREATE TRIGGER on_auth_user_email_verified
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION on_auth_user_email_verified();

-- COMMENT ON TRIGGER ... ON auth.users would require ownership of
-- auth.users which the migration role doesn't have. The function comment
-- above documents intent.
