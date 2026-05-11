-- /lab/debate-room — multi-LLM (mixed-model) debate sessions.
--
-- Mirrors prove_sessions schema (so the debate engine can write the same
-- rounds/votes/verdict/report structure into either table via
-- save_prove_results(table=...)) PLUS a persona_models jsonb column
-- recording which LLM each persona ran on. Lives in its own table so
-- mixed-LLM experimentation doesn't pollute the production Prove dataset
-- used by /prove-report and downstream analytics.
--
-- Compatibility notes:
--   - Schema is INTENTIONALLY a superset of prove_sessions. The engine's
--     save_prove_results helper takes a `table` parameter (added in the
--     Sprint 1 commit) and writes the same column set; lab_sessions
--     accepts those writes plus the extra persona_models column.
--   - Free-tier for testing: no quota gating. The /api/lab/debate-room/
--     start route does NOT call consume_quota (unlike /api/prove/start).
--   - RLS mirrors prove_sessions: users only see / write their own rows.

CREATE TABLE IF NOT EXISTS lab_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  idea text NOT NULL,
  -- Per-persona model config used for this run. Shape:
  -- { "proposer":   {"provider":"anthropic","model":"claude-opus-4-7"},
  --   "challenger": {"provider":"openai","model":"gpt-5.5"},
  --   "analyst":    {"provider":"google","model":"gemini-3.1-pro-preview"},
  --   "reviewer":   {"provider":"anthropic","model":"claude-sonnet-4-6"},
  --   "defender":   {"provider":"minimax","model":"MiniMax-M2.7"},
  --   "strategist": {"provider":"anthropic","model":"claude-opus-4-7"} }
  -- API keys are NOT stored here — they're decrypted at dispatch time
  -- from the user's api_keys row and pushed to the engine in-memory only.
  persona_models jsonb NOT NULL DEFAULT '{}',
  -- Mirrors prove_sessions columns one-to-one so the engine can reuse
  -- save_prove_results(table='lab_sessions').
  rounds jsonb NOT NULL DEFAULT '[]',
  votes jsonb NOT NULL DEFAULT '{}',
  verdict text,
  report jsonb,
  status text NOT NULL DEFAULT 'pending',
  progress smallint NOT NULL DEFAULT 0,
  progress_message text NOT NULL DEFAULT '',
  total_cost_usd real NOT NULL DEFAULT 0,
  total_input_tokens integer NOT NULL DEFAULT 0,
  total_output_tokens integer NOT NULL DEFAULT 0,
  -- "model" on prove_sessions = the single model used; for lab it's the
  -- proposer's model (canonical "primary voice") so the existing report
  -- UI rendering doesn't break when read from this table.
  model text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_sessions_user_id_created
  ON lab_sessions(user_id, created_at DESC);

ALTER TABLE lab_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_sessions_select" ON lab_sessions;
CREATE POLICY "lab_sessions_select" ON lab_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lab_sessions_insert" ON lab_sessions;
CREATE POLICY "lab_sessions_insert" ON lab_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lab_sessions_update" ON lab_sessions;
CREATE POLICY "lab_sessions_update" ON lab_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lab_sessions_delete" ON lab_sessions;
CREATE POLICY "lab_sessions_delete" ON lab_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Service role (engine background tasks) bypasses RLS via the standard
-- "auth.role() = 'service_role'" pattern; we mirror it here so the engine
-- can write progress + final results without impersonating the user.
DROP POLICY IF EXISTS "lab_sessions_service_role" ON lab_sessions;
CREATE POLICY "lab_sessions_service_role" ON lab_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Realtime: enable so the run-page can subscribe to UPDATE events for
-- progress streaming (same pattern as prove_sessions / forge_sessions).
ALTER PUBLICATION supabase_realtime ADD TABLE lab_sessions;

COMMENT ON TABLE lab_sessions IS
  'Multi-LLM (mixed-model) debate sessions for /lab/debate-room. Schema is a superset of prove_sessions so the engine reuses save_prove_results(table="lab_sessions"). Free for testing — no quota gating.';
