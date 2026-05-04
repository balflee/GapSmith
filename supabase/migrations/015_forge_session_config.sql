-- Persist the SESSION_CONFIG markdown the user supplied when starting a Forge
-- session, so Prove can inherit the same constraints when debating a Forge idea
-- (instead of evaluating it under a different bar from a fresh form).
--
-- Empty string = the user didn't expand the Project Context card; downstream
-- agents fall back to defaults exactly as they did before.

ALTER TABLE forge_sessions
  ADD COLUMN IF NOT EXISTS session_config text NOT NULL DEFAULT '';
