-- Forge sessions: add progress tracking + cost columns + enable Realtime
-- Mirrors scout_reports progress pattern (migrations 003 + 004)

ALTER TABLE forge_sessions
  ADD COLUMN IF NOT EXISTS progress smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_message text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS total_cost_usd real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT '';

-- Enable Realtime for forge_sessions (allows frontend to subscribe to progress updates)
ALTER PUBLICATION supabase_realtime ADD TABLE forge_sessions;
