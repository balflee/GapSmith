"""
Supabase storage adapter — persists session state, reports, and rounds to PostgreSQL.
"""

from __future__ import annotations

import json
import os

try:
    from supabase import create_client, Client
except ImportError:
    raise ImportError("supabase is required: pip install supabase")

from engine.core.providers import StorageProvider


class SupabaseStorage:
    """Storage provider using Supabase (PostgreSQL)."""

    def __init__(self, url: str | None = None, key: str | None = None):
        self.url = url or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        self.key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not self.url or not self.key:
            raise ValueError("Supabase URL and service role key are required")
        self.client: Client = create_client(self.url, self.key)

    async def save_state(self, session_id: str, state: dict) -> None:
        """Save full session state as JSON."""
        # Detect table from state content
        table = self._detect_table(state)
        self.client.table(table).update(
            {"status": state.get("status", "running")}
        ).eq("id", session_id).execute()

    async def load_state(self, session_id: str) -> dict | None:
        """Load session state. Tries all session tables."""
        for table in ["scout_reports", "forge_sessions", "prove_sessions"]:
            result = self.client.table(table).select("*").eq("id", session_id).limit(1).execute()
            if result.data:
                return result.data[0]
        return None

    async def update_status(self, table: str, session_id: str, status: str) -> None:
        """Update session status (pending → running → complete → error)."""
        self.client.table(table).update({"status": status}).eq("id", session_id).execute()

    async def update_progress(self, table: str, session_id: str, progress: int, message: str) -> None:
        """Update progress percentage and message for real-time tracking."""
        self.client.table(table).update({
            "progress": progress,
            "progress_message": message,
        }).eq("id", session_id).execute()

    async def append_round(self, session_id: str, round_data: dict) -> None:
        """Append a debate/brainstorm round to the session's rounds JSONB array."""
        # Fetch current rounds, append, update
        for table in ["forge_sessions", "prove_sessions"]:
            result = self.client.table(table).select("rounds").eq("id", session_id).limit(1).execute()
            if result.data:
                current = result.data[0].get("rounds") or []
                current.append(round_data)
                self.client.table(table).update({"rounds": current}).eq("id", session_id).execute()
                return

    async def save_report(self, session_id: str, report: dict) -> None:
        """Save final report and mark session complete."""
        for table, report_field in [
            ("scout_reports", "gaps"),
            ("forge_sessions", "top_ideas"),
            ("prove_sessions", "report"),
        ]:
            result = self.client.table(table).select("id").eq("id", session_id).limit(1).execute()
            if result.data:
                update = {"status": "complete"}
                update[report_field] = report
                self.client.table(table).update(update).eq("id", session_id).execute()
                return

    async def save_scout_results(
        self, session_id: str, gaps: list, pain_clusters: list, trends: list,
        daily_brief: str = "", topics: str = "", keywords: list | None = None,
        total_cost_usd: float = 0, total_input_tokens: int = 0, total_output_tokens: int = 0, model: str = "",
    ) -> None:
        """Save Scout-specific results."""
        self.client.table("scout_reports").update({
            "gaps": gaps,
            "pain_clusters": pain_clusters,
            "trends": trends,
            "daily_brief": daily_brief,
            "topics": topics,
            "keywords": keywords or [],
            "total_cost_usd": round(total_cost_usd, 6),
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "model": model,
            "status": "complete",
        }).eq("id", session_id).execute()

    async def save_forge_results(
        self, session_id: str, rounds: list, top_ideas: list,
        total_cost_usd: float = 0, total_input_tokens: int = 0,
        total_output_tokens: int = 0, model: str = "",
    ) -> None:
        """Save Forge-specific results."""
        self.client.table("forge_sessions").update({
            "rounds": rounds,
            "top_ideas": top_ideas,
            "total_cost_usd": round(total_cost_usd, 6),
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "model": model,
            "status": "complete",
        }).eq("id", session_id).execute()

    async def save_prove_results(
        self, session_id: str, rounds: list, votes: dict, verdict: str, report: dict,
        total_cost_usd: float = 0, total_input_tokens: int = 0,
        total_output_tokens: int = 0, model: str = "",
        table: str = "prove_sessions",
    ) -> None:
        """Save final Prove results. `table` defaults to prove_sessions but can
        be set to "lab_sessions" for /lab/debate-room mixed-LLM runs that
        share the same row schema but persist to a separate table."""
        self.client.table(table).update({
            "rounds": rounds,
            "votes": votes,
            "verdict": verdict,
            "report": report,
            "total_cost_usd": round(total_cost_usd, 6),
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "model": model,
            "status": "complete",
        }).eq("id", session_id).execute()

    async def get_user_api_key(self, user_id: str) -> dict | None:
        """Fetch user's encrypted API key row."""
        result = self.client.table("api_keys").select("*").eq("user_id", user_id).limit(1).execute()
        return result.data[0] if result.data else None

    # ---- Agent jobs (x402-paid API calls) ----

    async def update_agent_job_progress(self, job_id: str, progress_pct: int) -> None:
        """Mirror progress to agent_jobs row for x402 status polling.

        Sets started_at only on the first transition (when it's still NULL)
        so it accurately marks pipeline-start, not last-progress.
        """
        try:
            # First, set started_at only if it's NULL (idempotent first-write)
            self.client.table("agent_jobs").update({
                "started_at": "now()",
            }).eq("id", job_id).is_("started_at", "null").execute()
            # Then update status + progress regardless
            self.client.table("agent_jobs").update({
                "status": "running",
                "progress_pct": max(0, min(100, progress_pct)),
            }).eq("id", job_id).execute()
        except Exception:
            pass  # Non-critical — job will still complete

    async def complete_agent_job(self, job_id: str, result: dict) -> dict | None:
        """Mark agent_job completed + cache result. Returns the updated row (incl. webhook_url)."""
        try:
            res = self.client.table("agent_jobs").update({
                "status": "completed",
                "progress_pct": 100,
                "result": result,
                "completed_at": "now()",
            }).eq("id", job_id).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            print(f"[AGENT_JOB] complete failed for {job_id}: {e}", flush=True)
            return None

    async def fail_agent_job(self, job_id: str, error: str) -> dict | None:
        """Mark agent_job failed + record error. Returns the row so caller can fire webhook."""
        try:
            res = self.client.table("agent_jobs").update({
                "status": "failed",
                "error": str(error)[:500],
                "completed_at": "now()",
            }).eq("id", job_id).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            print(f"[AGENT_JOB] fail update errored for {job_id}: {e}", flush=True)
            return None

    async def append_live_event(self, table: str, session_id: str, event: dict) -> None:
        """Atomically append one agent-reply event to lab_sessions.live_events.

        Only lab_sessions carries the column (added in migration 018).
        Prove sessions intentionally don't stream per-message — they
        keep the existing batched-round flow — so this call is a no-op
        for table='prove_sessions'.

        Best-effort: live streaming is UX, not durability. If the RPC
        errors (network blip, transient timeout), log and continue —
        the debate must never crash because a telemetry write failed.
        Note: multiple sub-agents append concurrently in some phases;
        the RPC is row-locked SECURITY DEFINER so concurrent writes
        serialize correctly.
        """
        if table != "lab_sessions":
            return
        try:
            self.client.rpc("append_live_event", {
                "p_session_id": session_id,
                "p_event": event,
            }).execute()
        except Exception as e:
            print(f"[LIVE EVENT] append failed for {session_id}: {e}", flush=True)

    async def refund_quota(self, user_id: str, sku: str) -> dict | None:
        """Atomically refund one quota unit (engine calls this on classified
        upstream LLM failure: 503/529/rate-limit/network). Wraps the
        refund_quota Postgres RPC defined in migration 016. Returns the RPC
        result dict ({'ok': True/False, ...}) or None on infrastructure
        error — refund is best-effort recovery, never fail the engine
        because of it."""
        try:
            res = self.client.rpc("refund_quota", {
                "user_id_in": user_id,
                "sku_in": sku,
            }).execute()
            return res.data if res.data else None
        except Exception as e:
            print(f"[QUOTA REFUND] RPC errored for user={user_id} sku={sku}: {e}", flush=True)
            return None

    def _detect_table(self, state: dict) -> str:
        if "gaps" in state or "pain_clusters" in state:
            return "scout_reports"
        if "top_ideas" in state:
            return "forge_sessions"
        return "prove_sessions"
