-- GapSmith initial schema
-- Tables: api_keys, scout_reports, forge_sessions, prove_sessions, purchases, purchase_counts, user_status

-- ================================================================
-- api_keys — stores encrypted user LLM API keys (BYOK model)
-- Users bring their own Claude/GPT/Gemini/DeepSeek keys.
-- Keys are AES-256-GCM encrypted before storage (see src/lib/crypto.ts).
-- ================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  provider text NOT NULL,          -- e.g. "anthropic", "openai", "google", "deepseek"
  encrypted_key text NOT NULL,     -- AES-256-GCM ciphertext (base64)
  model text,                      -- last validated model name
  validated_at timestamptz,        -- timestamp of last successful validation
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_select" ON api_keys;
CREATE POLICY "api_keys_select" ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_insert" ON api_keys;
CREATE POLICY "api_keys_insert" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_update" ON api_keys;
CREATE POLICY "api_keys_update" ON api_keys
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_delete" ON api_keys;
CREATE POLICY "api_keys_delete" ON api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- scout_reports — stores completed Scout market scan reports
-- Each report contains gap analysis, pain clusters, and trends
-- derived from RSS + community pain source scanning.
-- ================================================================
CREATE TABLE IF NOT EXISTS scout_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  sectors jsonb NOT NULL DEFAULT '[]',       -- array of selected sector strings
  gaps jsonb NOT NULL DEFAULT '[]',          -- array of market gap objects
  pain_clusters jsonb NOT NULL DEFAULT '[]', -- array of pain cluster objects
  trends jsonb NOT NULL DEFAULT '[]',        -- array of trend objects
  status text NOT NULL DEFAULT 'pending',    -- pending | running | complete | error
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scout_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scout_reports_select" ON scout_reports;
CREATE POLICY "scout_reports_select" ON scout_reports
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "scout_reports_insert" ON scout_reports;
CREATE POLICY "scout_reports_insert" ON scout_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "scout_reports_update" ON scout_reports;
CREATE POLICY "scout_reports_update" ON scout_reports
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "scout_reports_delete" ON scout_reports;
CREATE POLICY "scout_reports_delete" ON scout_reports
  FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- forge_sessions — stores AI brainstorming sessions (Forge product)
-- 5-round brainstorm with Proposer + Defender producing Top 3 ideas.
-- Optionally linked to a Scout report for context.
-- ================================================================
CREATE TABLE IF NOT EXISTS forge_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  scout_report_id uuid REFERENCES scout_reports(id),  -- optional: linked scout report
  rounds jsonb NOT NULL DEFAULT '[]',      -- array of round objects (proposer + defender outputs)
  top_ideas jsonb NOT NULL DEFAULT '[]',   -- array of top 3 idea objects with Kill/RICE scores
  status text NOT NULL DEFAULT 'pending',  -- pending | running | complete | error
  created_at timestamptz DEFAULT now()
);

ALTER TABLE forge_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forge_sessions_select" ON forge_sessions;
CREATE POLICY "forge_sessions_select" ON forge_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "forge_sessions_insert" ON forge_sessions;
CREATE POLICY "forge_sessions_insert" ON forge_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "forge_sessions_update" ON forge_sessions;
CREATE POLICY "forge_sessions_update" ON forge_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "forge_sessions_delete" ON forge_sessions;
CREATE POLICY "forge_sessions_delete" ON forge_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- prove_sessions — stores multi-agent debate sessions (Prove product)
-- 6 specialized AI agents argue, vote, and produce a verification report.
-- ================================================================
CREATE TABLE IF NOT EXISTS prove_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  idea text NOT NULL,                       -- the idea being stress-tested
  rounds jsonb NOT NULL DEFAULT '[]',       -- array of debate round objects (agent outputs per phase)
  votes jsonb NOT NULL DEFAULT '{}',        -- agent voting results
  verdict text,                             -- PROCEED | CONDITIONAL | REJECT
  report jsonb,                             -- full verification report (consensus, MVP plan, ROI analysis)
  status text NOT NULL DEFAULT 'pending',   -- pending | running | complete | error
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prove_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prove_sessions_select" ON prove_sessions;
CREATE POLICY "prove_sessions_select" ON prove_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "prove_sessions_insert" ON prove_sessions;
CREATE POLICY "prove_sessions_insert" ON prove_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "prove_sessions_update" ON prove_sessions;
CREATE POLICY "prove_sessions_update" ON prove_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "prove_sessions_delete" ON prove_sessions;
CREATE POLICY "prove_sessions_delete" ON prove_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- purchases — records completed payment transactions per user
-- Tracks which SKUs each user has purchased for access control.
-- ================================================================
CREATE TABLE IF NOT EXISTS purchases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  sku text NOT NULL,               -- scout | forge | prove | bundle | cli
  amount_cents integer NOT NULL,   -- price paid in cents at time of purchase
  stripe_session_id text,          -- Stripe checkout session ID for reconciliation
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_select" ON purchases;
CREATE POLICY "purchases_select" ON purchases
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "purchases_insert" ON purchases;
CREATE POLICY "purchases_insert" ON purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "purchases_update" ON purchases;
CREATE POLICY "purchases_update" ON purchases
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "purchases_delete" ON purchases;
CREATE POLICY "purchases_delete" ON purchases
  FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- purchase_counts — tracks dynamic pricing counters per SKU
-- No user_id — counts total purchases across all users.
-- Used to implement "price goes up with every purchase" mechanic.
-- Writable by service role only (webhook handler bypasses RLS).
-- ================================================================
CREATE TABLE IF NOT EXISTS purchase_counts (
  sku text PRIMARY KEY,    -- scout | forge | prove | bundle | cli
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE purchase_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_counts_select" ON purchase_counts;
CREATE POLICY "purchase_counts_select" ON purchase_counts
  FOR SELECT USING (true);  -- publicly readable for pricing display

DROP POLICY IF EXISTS "purchase_counts_service_write" ON purchase_counts;
CREATE POLICY "purchase_counts_service_write" ON purchase_counts
  FOR ALL USING (auth.role() = 'service_role');

-- Seed initial SKU rows so counters exist before first purchase
INSERT INTO purchase_counts (sku, count) VALUES
  ('scout', 0),
  ('forge', 0),
  ('prove', 0),
  ('bundle', 0),
  ('cli', 0)
ON CONFLICT (sku) DO NOTHING;

-- ================================================================
-- user_status — tracks activation and email nudge state per user
-- Service role only — written by webhook and cron handlers.
-- Used by the nudge email cron to find unactivated users.
-- ================================================================
CREATE TABLE IF NOT EXISTS user_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,    -- set when user completes first activation action
  nudge_sent_at timestamptz    -- set after nudge email sent (prevents duplicates)
);

ALTER TABLE user_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_status_service_role" ON user_status;
CREATE POLICY "user_status_service_role" ON user_status
  FOR ALL USING (auth.role() = 'service_role');
