"""
FastAPI service — exposes pipeline endpoints for the Next.js frontend.
Runs as a separate Python process (Railway service) alongside the Next.js app.

Usage:
  uvicorn engine.api:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import traceback
from urllib.parse import urlparse

import aiohttp
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.core.factory import create_providers
from engine.core.scout_runner import run_scout
from engine.core.ideation_runner import run_ideation
from engine.core.debate_runner import run_debate

app = FastAPI(title="GapSmith Engine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
        "http://localhost:3000",
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# --- Request models ---

class RunScoutRequest(BaseModel):
    session_id: str
    user_id: str
    sectors: list[str]
    api_key: str          # decrypted by Next.js before forwarding
    provider: str
    model: str
    focus_keywords: list[str] = []


class RunForgeRequest(BaseModel):
    session_id: str
    user_id: str
    context: str          # Scout report or user input
    api_key: str
    provider: str
    model: str
    session_config: str = ""           # Optional SESSION_CONFIG.md (Profile/Budget/Timeline/Revenue_threshold)
    agent_job_id: str | None = None    # Set when called via /api/v1/forge/ideate (agent x402)


class RunProveRequest(BaseModel):
    session_id: str
    user_id: str
    idea: str
    api_key: str
    provider: str
    model: str
    session_config: str = ""
    agent_job_id: str | None = None    # Set when called via /api/v1/prove/debate (agent x402)


# --- Webhook delivery (for x402 async jobs) ---

async def _deliver_webhook(url: str, job_id: str, status: str, result: dict) -> None:
    """POST job result to user-supplied webhook_url with HMAC signature header.

    Best-effort: failure to deliver doesn't fail the job (caller can poll instead).
    Validates URL scheme to avoid SSRF (only http/https, never file:// or internal).
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            print(f"[WEBHOOK] skipping non-http url: {url}", flush=True)
            return

        body = json.dumps({
            "jobId": job_id,
            "status": status,
            "result": result,
        }).encode("utf-8")

        secret = os.environ.get("AGENT_WEBHOOK_SECRET", "").encode("utf-8")
        signature = hmac.new(secret, body, hashlib.sha256).hexdigest() if secret else ""

        timeout = aiohttp.ClientTimeout(total=15.0)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            await session.post(
                url,
                data=body,
                headers={
                    "content-type": "application/json",
                    "x-gapsmith-signature": signature,
                    "x-gapsmith-job-id": job_id,
                },
            )
    except Exception as e:
        print(f"[WEBHOOK] delivery to {url} failed: {e}", flush=True)


# --- Background task runners ---

async def _run_scout_bg(req: RunScoutRequest):
    """Background: run full Scout pipeline."""
    providers = create_providers(
        api_key=req.api_key, provider=req.provider,
        model=req.model, user_id=req.user_id,
        tavily_key=os.environ.get("TAVILY_API_KEY"),
    )

    last_pct = 0

    async def on_progress(step: str, message: str, pct: int | None):
        """Write progress to Supabase for Realtime subscribers."""
        nonlocal last_pct
        if pct is not None:
            last_pct = pct
        try:
            await providers.storage.update_progress(
                "scout_reports", req.session_id, last_pct, message
            )
        except Exception:
            pass  # Non-critical — don't crash pipeline for progress write failure

    try:
        await run_scout(
            session_id=req.session_id,
            sectors=req.sectors,
            providers=providers,
            on_progress=on_progress,
            focus_keywords=req.focus_keywords,
        )
    except Exception as e:
        print(f"[SCOUT ERROR] {req.session_id}: {e}", flush=True)
        traceback.print_exc()
        try:
            await providers.storage.update_progress(
                "scout_reports", req.session_id, last_pct, f"Error: {str(e)[:200]}"
            )
            await providers.storage.update_status("scout_reports", req.session_id, "error")
        except Exception:
            pass


async def _run_forge_bg(req: RunForgeRequest):
    """Background: run Forge pipeline (5-round brainstorm).

    If req.agent_job_id is set, also mirrors progress + final result to the
    agent_jobs table so /api/v1/jobs/{id} polling sees state, and POSTs to
    webhook_url (if set on the agent_jobs row) on completion.
    """
    tavily_key = os.environ.get("TAVILY_API_KEY")
    print(f"[FORGE] session={req.session_id} provider={req.provider} model={req.model} tavily={'yes' if tavily_key else 'NO'} agent_job={req.agent_job_id or '-'}", flush=True)
    providers = create_providers(
        api_key=req.api_key, provider=req.provider,
        model=req.model, user_id=req.user_id,
        tavily_key=tavily_key,
    )
    print(f"[FORGE] providers.search={'TavilySearch' if providers.search else 'None'}", flush=True)

    last_pct = 0

    async def on_progress(step: str, message: str, pct: int | None):
        """Write progress to Supabase for Realtime subscribers."""
        nonlocal last_pct
        if pct is not None:
            last_pct = pct
        try:
            await providers.storage.update_progress(
                "forge_sessions", req.session_id, last_pct, message
            )
        except Exception:
            pass  # Non-critical
        # Mirror to agent_jobs if this run came from x402
        if req.agent_job_id:
            try:
                await providers.storage.update_agent_job_progress(req.agent_job_id, last_pct)
            except Exception:
                pass

    try:
        await run_ideation(
            session_id=req.session_id,
            context=req.context,
            providers=providers,
            on_progress=on_progress,
            session_config=req.session_config,
        )

        # Mirror final result to agent_jobs + fire webhook if x402-paid run.
        # Includes the full top_ideas (20 fields each) AND the rounds[] transcript so
        # agents have content parity with webapp/CLI users — they paid for the full
        # multi-agent run, they get the full deliverable. Internal economics (LLM
        # cost, token counts) are intentionally omitted: that's our business, not
        # the agent's.
        if req.agent_job_id:
            try:
                result = await providers.storage.load_state(req.session_id) or {}
                # Strip per-round cost/token fields — they're embedded in
                # forge_sessions.rounds but the agent payload should not surface
                # internal economics. Keep round number + agent outputs only.
                COST_TOKEN_KEYS = {
                    "defender_cost", "proposer_cost",
                    "defender_tokens", "proposer_tokens",
                    "defender_out_tokens", "proposer_out_tokens",
                    "input_tokens", "output_tokens", "cost",
                }
                clean_rounds = []
                for r in result.get("rounds", []) or []:
                    if isinstance(r, dict):
                        clean_rounds.append({k: v for k, v in r.items() if k not in COST_TOKEN_KEYS})
                    else:
                        clean_rounds.append(r)
                agent_result = {
                    "top_ideas": result.get("top_ideas", []),
                    "rounds": clean_rounds,
                    "session_id": req.session_id,
                    "model": result.get("model", req.model),
                }
                row = await providers.storage.complete_agent_job(req.agent_job_id, agent_result)
                webhook_url = (row or {}).get("webhook_url")
                if webhook_url:
                    await _deliver_webhook(webhook_url, req.agent_job_id, "completed", agent_result)
            except Exception as e:
                print(f"[FORGE AGENT_JOB] post-success update failed: {e}", flush=True)

    except Exception as e:
        print(f"[FORGE ERROR] {req.session_id}: {e}", flush=True)
        traceback.print_exc()
        try:
            await providers.storage.update_progress(
                "forge_sessions", req.session_id, last_pct, f"Error: {str(e)[:200]}"
            )
            await providers.storage.update_status("forge_sessions", req.session_id, "error")
        except Exception:
            pass
        if req.agent_job_id:
            try:
                row = await providers.storage.fail_agent_job(req.agent_job_id, str(e))
                webhook_url = (row or {}).get("webhook_url")
                if webhook_url:
                    await _deliver_webhook(webhook_url, req.agent_job_id, "failed", {"error": str(e)[:500]})
            except Exception as e2:
                print(f"[FORGE AGENT_JOB] post-fail update failed: {e2}", flush=True)


async def _run_prove_bg(req: RunProveRequest):
    """Background: run Prove pipeline (multi-agent debate).

    If req.agent_job_id is set, also mirrors progress + final verdict /
    report to the agent_jobs table so /api/v1/jobs/{id} polling sees state,
    and POSTs to webhook_url (if set) on completion.
    """
    print(f"[PROVE] session={req.session_id} provider={req.provider} model={req.model} agent_job={req.agent_job_id or '-'}", flush=True)
    providers = create_providers(
        api_key=req.api_key, provider=req.provider,
        model=req.model, user_id=req.user_id,
        tavily_key=os.environ.get("TAVILY_API_KEY"),
    )

    last_pct = 0

    async def on_progress(step: str, message: str, pct: int | None):
        nonlocal last_pct
        if pct is not None:
            last_pct = pct
        try:
            await providers.storage.update_progress(
                "prove_sessions", req.session_id, last_pct, message
            )
        except Exception:
            pass
        # Mirror to agent_jobs if this run came from x402
        if req.agent_job_id:
            try:
                await providers.storage.update_agent_job_progress(req.agent_job_id, last_pct)
            except Exception:
                pass

    try:
        await run_debate(
            session_id=req.session_id,
            idea=req.idea,
            providers=providers,
            on_progress=on_progress,
            session_config=req.session_config,
        )

        # Mirror final result to agent_jobs + fire webhook if x402-paid run.
        # Prove rounds carry agent outputs (proposer/challenger/analyst/etc.) but
        # NOT per-round cost/token fields (those live on prove_sessions row).
        # So clean_rounds doesn't need stripping — pass through.
        if req.agent_job_id:
            try:
                result = await providers.storage.load_state(req.session_id) or {}
                agent_result = {
                    "verdict": result.get("verdict", ""),
                    "report": result.get("report", {}),
                    "rounds": result.get("rounds", []) or [],
                    "votes": result.get("votes", {}) or {},
                    "session_id": req.session_id,
                    "model": result.get("model", req.model),
                }
                row = await providers.storage.complete_agent_job(req.agent_job_id, agent_result)
                webhook_url = (row or {}).get("webhook_url")
                if webhook_url:
                    await _deliver_webhook(webhook_url, req.agent_job_id, "completed", agent_result)
            except Exception as e:
                print(f"[PROVE AGENT_JOB] post-success update failed: {e}", flush=True)

    except Exception as e:
        print(f"[PROVE ERROR] {req.session_id}: {e}", flush=True)
        traceback.print_exc()
        try:
            await providers.storage.update_progress(
                "prove_sessions", req.session_id, last_pct, f"Error: {str(e)[:200]}"
            )
            await providers.storage.update_status("prove_sessions", req.session_id, "error")
        except Exception:
            pass
        if req.agent_job_id:
            try:
                row = await providers.storage.fail_agent_job(req.agent_job_id, str(e))
                webhook_url = (row or {}).get("webhook_url")
                if webhook_url:
                    await _deliver_webhook(webhook_url, req.agent_job_id, "failed", {"error": str(e)[:500]})
            except Exception as e2:
                print(f"[PROVE AGENT_JOB] post-fail update failed: {e2}", flush=True)


# --- API endpoints ---

@app.post("/api/engine/scout")
async def start_scout(req: RunScoutRequest, background_tasks: BackgroundTasks):
    """Start Scout pipeline in background."""
    background_tasks.add_task(_run_scout_bg, req)
    return {"status": "started", "session_id": req.session_id}


@app.post("/api/engine/forge")
async def start_forge(req: RunForgeRequest, background_tasks: BackgroundTasks):
    """Start Forge pipeline in background."""
    background_tasks.add_task(_run_forge_bg, req)
    return {"status": "started", "session_id": req.session_id}


@app.post("/api/engine/prove")
async def start_prove(req: RunProveRequest, background_tasks: BackgroundTasks):
    """Start Prove pipeline in background."""
    background_tasks.add_task(_run_prove_bg, req)
    return {"status": "started", "session_id": req.session_id}


@app.get("/api/engine/health")
async def health():
    tavily = bool(os.environ.get("TAVILY_API_KEY"))
    return {"status": "ok", "engine": "gapsmith", "version": "0.2.0", "tavily": tavily}


# --- Test endpoints (no LLM calls, zero cost) ---

@app.get("/api/engine/test/scout")
async def test_scout():
    """Dry-run Scout: RSS fetch + pain fetch only (no LLM scoring). Zero token cost."""
    from engine.core.rss_fetcher import run_rss_fetch
    from engine.core.pain_fetcher import run_pain_fetch

    # Fetch just 2 sectors to keep it fast
    test_sectors = [11, 10]  # AI/ML, SaaS

    rss_result = await run_rss_fetch(sector_ids=test_sectors)
    pain_result = await run_pain_fetch(sector_ids=test_sectors)

    return {
        "test": "scout",
        "status": "ok",
        "rss": {
            "articles_fetched": len(rss_result["articles"]),
            "stats": rss_result["stats"],
            "sample": [
                {"title": a["title"][:80], "source": a["source_name"]}
                for a in rss_result["articles"][:5]
            ],
        },
        "pain": {
            "posts_fetched": len(pain_result["posts"]),
            "stats": pain_result["stats"],
            "sample": [
                {"title": p["title"][:80], "source": p["source_name"]}
                for p in pain_result["posts"][:5]
            ],
        },
    }
