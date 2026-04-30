-- Add progress tracking, cost, and label columns to prove_sessions
ALTER TABLE prove_sessions
  ADD COLUMN IF NOT EXISTS progress smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_message text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS total_cost_usd real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';

-- Enable Supabase Realtime for prove_sessions (required for live progress)
ALTER PUBLICATION supabase_realtime ADD TABLE prove_sessions;
