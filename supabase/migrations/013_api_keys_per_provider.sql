-- Multi-provider API keys.
--
-- Bug surfaced 2026-04-28: saving an OpenAI key after a Claude key
-- overwrote the Claude row. Cause: api_keys has no unique constraint,
-- and the POST route fell back to UPDATE WHERE user_id=? without a
-- provider filter — wiping all of the user's other keys.
--
-- Fix: enforce one row per (user_id, provider). Dedupe first by
-- keeping the newest row per (user_id, provider).

-- Step 1: dedupe — keep the most recent row per (user_id, provider)
DELETE FROM api_keys a USING api_keys b
WHERE a.user_id = b.user_id
  AND a.provider = b.provider
  AND a.id <> b.id
  AND a.created_at < b.created_at;

-- Step 2: enforce uniqueness so onConflict("user_id,provider") works.
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_user_provider_unique;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_user_provider_unique UNIQUE (user_id, provider);

COMMENT ON CONSTRAINT api_keys_user_provider_unique ON api_keys IS
  'One stored key per (user, LLM provider). Lets users keep separate Claude, OpenAI, etc. keys.';
