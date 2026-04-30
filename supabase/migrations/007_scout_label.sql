-- Add label column to scout_reports for user-friendly naming
ALTER TABLE scout_reports
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
