-- Store full curation output in scout_reports
ALTER TABLE scout_reports
  ADD COLUMN IF NOT EXISTS daily_brief text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS topics text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS keywords jsonb NOT NULL DEFAULT '[]';
