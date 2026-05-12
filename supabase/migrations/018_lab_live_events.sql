-- /lab/debate-room — message-level live streaming.
--
-- The engine writes one entry into live_events after EACH agent reply
-- completes, instead of waiting for a whole round to finish before
-- flushing rounds[]. Realtime subscribers re-render the chat as each
-- new event appears, giving lab debates a real "watch them argue" UX
-- distinct from the batched Prove report flow.
--
-- Event shape (one element per agent call):
--   { "persona": "challenger",         -- agent or sub-agent name
--     "phase": "B",                    -- A | A5 | B | C | D | STRATEGIST | MINI_ROUND | SUB
--     "round": 2,                      -- 1-based round number
--     "markdown": "## My counter…",    -- agent's full reply
--     "is_sub_agent": false,           -- true for trend_scout / benchmark_hunter / etc.
--     "ts": "2026-05-12T05:23:01Z" }   -- ISO timestamp written by engine
--
-- Atomicity: multiple sub-agents (Benchmark Hunter, Contrarian, etc.)
-- run in parallel and can race to append. We expose append_live_event()
-- as a SECURITY DEFINER RPC that does a row-locked UPDATE …
-- live_events || jsonb_build_array(...) so concurrent appends serialize
-- safely. The client-side read path already gets atomic snapshots from
-- Postgres MVCC.

ALTER TABLE lab_sessions
  ADD COLUMN IF NOT EXISTS live_events jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN lab_sessions.live_events IS
  'Append-only stream of per-agent messages. Written by engine debate_runner via append_live_event() RPC as each persona completes its LLM call. Realtime UPDATE events fan out to the lab room client.';

-- Atomic append. Locks the lab_sessions row briefly and concatenates
-- the new event onto the live_events array. SECURITY DEFINER so the
-- service role can call it without requiring a user JWT; client-side
-- has no business calling this — only the engine does.
CREATE OR REPLACE FUNCTION append_live_event(p_session_id uuid, p_event jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE lab_sessions
  SET live_events = live_events || jsonb_build_array(p_event)
  WHERE id = p_session_id;
END;
$$;

-- Only the engine (service_role) calls this. We deliberately do NOT
-- grant execute to authenticated users — the only sanctioned writer is
-- the engine, and lab users can read events via the SELECT RLS policy.
REVOKE ALL ON FUNCTION append_live_event(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_live_event(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION append_live_event(uuid, jsonb) IS
  'Atomically append one event to lab_sessions.live_events. Called by engine debate_runner after each agent reply. service_role only.';
