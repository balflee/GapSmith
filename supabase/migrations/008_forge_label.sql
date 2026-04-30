-- Add label column to forge_sessions for user-friendly naming
ALTER TABLE forge_sessions
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
