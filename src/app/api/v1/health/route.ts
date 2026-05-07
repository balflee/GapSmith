/**
 * GET /api/v1/health — public, free system-health endpoint.
 *
 * Agents can probe this BEFORE deciding to call any paid endpoint
 * (Forge ideate $15, Prove debate $25). Returns the same shape that
 * the internal preflight uses, so an agent's health check matches the
 * server's settlement gate exactly.
 *
 * Free for two reasons:
 *   1. Charging for a "is the system up?" check is hostile UX
 *   2. The cost (1 LLM token + 1 Tavily search ~$0.0001) is dwarfed by
 *      the savings of agents NOT signing $15-25 USDC txs into
 *      currently-unfulfillable jobs
 *
 * Cached server-side (30s TTL via runPreflight) so a flood of probes
 * doesn't multiply our upstream cost.
 *
 * Response shape:
 *   {
 *     ok: boolean,                    // true if all critical paths healthy
 *     llm: { ok, latency_ms, error? },
 *     search: { ok, latency_ms, error? } | null,
 *     server_time: ISO8601 string
 *   }
 *
 * 200 = healthy
 * 503 = unhealthy (with Retry-After header)
 *
 * NOT a paid endpoint — bypasses x402 entirely.
 */

import { NextResponse } from "next/server";
import { runPreflight } from "@/lib/x402-preflight";

const AGENT_LLM_PROVIDER = process.env.AGENT_LLM_PROVIDER || "minimax";
const AGENT_LLM_MODEL = process.env.AGENT_LLM_MODEL || "MiniMax-M2.7";
const AGENT_LLM_KEY = process.env.AGENT_LLM_KEY || "";

export async function GET() {
  if (!AGENT_LLM_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "Agent compute API not configured (missing AGENT_LLM_KEY)",
        errorClass: "config",
        server_time: new Date().toISOString(),
      },
      { status: 503, headers: { "Retry-After": "600" } },
    );
  }

  const r = await runPreflight({
    provider: AGENT_LLM_PROVIDER,
    model: AGENT_LLM_MODEL,
    apiKey: AGENT_LLM_KEY,
    checkSearch: true,
  });

  const body = {
    ok: r.ok,
    llm: {
      ok: r.llmOk,
      latency_ms: r.llmLatencyMs,
      error: r.llmOk ? undefined : r.error,
    },
    search: r.searchOk === null
      ? null
      : { ok: r.searchOk, error: r.searchOk ? undefined : "search degraded" },
    errorClass: r.errorClass,
    server_time: new Date().toISOString(),
  };

  if (!r.ok) {
    const retryAfter = r.errorClass === "config" ? 600 : 30;
    return NextResponse.json(body, { status: 503, headers: { "Retry-After": String(retryAfter) } });
  }
  return NextResponse.json(body, { status: 200 });
}
