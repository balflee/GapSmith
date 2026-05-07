# GapSmith TODO

Tracked work that's been **decided but deferred**. Items that are just ideas
go in issues; this file is for things we explicitly punted with rationale
so future-us doesn't re-debate them.

---

## D — Agent API x402: preflight system-health check before settling payment

**Priority:** Medium — only matters once Agent API has real users / hackathon judges run it
**Origin:** 2026-05-07 thread that produced commits `7e8755c` (engine refund) +
`aacf908` (UI surface)
**Status:** Designed, not implemented

### Why preflight, not after-the-fact refund

When a UI-path Forge run fails on upstream LLM 5xx, we now refund quota
atomically (commit `7e8755c`). The Agent API path (`/api/v1/forge/ideate`,
`/api/v1/prove/debate`) does **not** have an equivalent for the x402 USDC
payment because:

1. **Refund tx is operationally heavy** — sweep merchant private key, build
   SPL refund tx, pay gas. $0.50 gas on a $15 refund is acceptable but
   $0.10 calls (`/api/v1/scout/gaps`) lose money on every refund.
2. **Most "failures" are predictable** — provider down, no API key, broken
   model name. A 1-token `"ok"` ping catches these for ~$0.0001 before we
   commit the agent's USDC.
3. **Mid-run failures are rare** — once the first LLM call succeeds, the
   provider is usually healthy for the next 5 minutes. A stale-cache check
   right before settle catches 95% of bad cases.

After-the-fact refund stays as the **fallback** for the rare mid-run case;
preflight is the primary defense.

### Design sketch

```
POST /api/v1/forge/ideate
  ↓
[1] x402 challenge → 402 with quote + tx instructions
  ↓ agent signs USDC tx
[2] PREFLIGHT (new): GET /api/engine/health/llm?provider=minimax
    - 1-token ping to MiniMax via the agent runtime LLM key
    - Tavily search ping (head request)
    - DB connectivity check (already in /health)
    - All pass → proceed to [3]
    - Any fail → return 503 with `Retry-After`; **do NOT confirm payment tx
      onchain** (the agent never signed final settlement). Pending USDC
      transfer expires per x402 spec.
  ↓
[3] Confirm payment + dispatch _run_forge_bg
  ↓
[4] Mid-run failure (rare): existing fail_agent_job + webhook fires.
    Manual on-chain refund SOP (deferred separately).
```

### Open questions

- Should preflight be cached per-provider for ~30s to avoid 1 ping per
  agent call when we have bursty traffic? (Probably yes — Redis or
  in-memory TTL on the engine.)
- Where does preflight live: in the Next.js `/api/v1/forge/ideate` route
  before `confirmPayment()`, or in the engine `/api/engine/forge` handler?
  Leaning Next.js side so failed preflight returns the agent's USDC tx
  to never-confirmed state without engine round-trip.
- Should we expose `/api/v1/health` as part of the public Agent API spec
  so agents can check before paying? Probably yes — add to OpenAPI.

### Files in scope

- `src/app/api/v1/forge/ideate/route.ts` — wrap settlement in preflight
- `src/app/api/v1/prove/debate/route.ts` — same
- `src/app/api/v1/health/route.ts` — new endpoint, agents can check
- `engine/api.py` — `/api/engine/health/llm` handler
- `src/app/api/v1/openapi.json` — document new health endpoint

### Acceptance

- Agent paying with bad MiniMax key gets 503 + USDC unsettled within
  5s instead of $15 settled + failed job.
- Preflight latency < 500ms p95 (cached) so it doesn't dominate the
  request.
- Existing UI path is unchanged (preflight is API-only).

---

## Tavily failure surfacing

**Priority:** Low — silent search degradation, not a billing/quota bug
**Status:** Known, not surfaced

### What's happening

`engine/core/debate_helpers.py:166` and
`engine/core/ideation_runner.py:_call_llm_with_search` both swallow
Tavily exceptions with bare `except Exception as e: print(...)`. The
pipeline continues with empty search results. User gets a degraded
report (no inline citations, no competitor URLs) without any
notification that search degraded.

### Fix sketch

- Track `tavily_failure_count` per session in the orchestration state.
- If > 50% of expected searches failed, surface a warning in the report
  payload: `report.warnings: ["Web search was unavailable for this run.
  Some sections may lack inline citations."]`.
- UI reads `warnings[]` and renders a yellow banner near the report
  header.

Not a quota issue (run still completed and delivered value), so no
refund logic needed.

---

## test_full_pipeline pytest-asyncio config

**Priority:** Trivial — test infra hygiene
**Origin:** Pre-existing before any 2026-05-07 work; flagged by `pytest`
output during hackathon test passes

`engine/tests/test_forge_pipeline.py::test_full_pipeline` fails with
`async def functions are not natively supported`. Either:

- Add `@pytest.mark.asyncio` decorator to the test function, or
- Set `asyncio_mode = "auto"` in `pyproject.toml` / `pytest.ini`.

Not blocking anything — the other 82 tests run fine and cover the same
surface area at unit granularity. Worth fixing when we next touch the
test config.
