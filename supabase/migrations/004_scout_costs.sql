-- Add cost and token tracking to scout_reports
ALTER TABLE scout_reports
  ADD COLUMN IF NOT EXISTS total_cost_usd real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT '';
