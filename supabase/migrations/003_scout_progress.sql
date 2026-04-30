-- Add real-time progress tracking to scout_reports
ALTER TABLE scout_reports
  ADD COLUMN IF NOT EXISTS progress smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_message text NOT NULL DEFAULT '';

-- Enable Supabase Realtime for scout_reports (required for postgres_changes subscriptions)
ALTER PUBLICATION supabase_realtime ADD TABLE scout_reports;
