/**
 * POST /api/v1/forge/ideate
 *
 * Compute API: runs the full Forge pipeline (5-round multi-agent brainstorm).
 * Async — returns 202 + jobId immediately; agent polls /api/v1/jobs/{id}
 * for progress + result. Pipeline takes ~25-40 min depending on context size.
 *
 * x402-paid: 15 USDC per call. We use server-side LLM key (MiniMax-M2.7,
 * ~$0.50/run cost → 96% margin). Agent doesn't need to bring their own key.
 *
 * Request body:
 * {
 *   "sectors": ["ai-ml"],                      // optional
 *   "context": "...",                          // optional, free-form context for the brainstorm
 *   "product_modes": ["saas", "agent"],        // optional
 *   "session_config": "Profile: Solo\nBudget: $1K\n...",  // optional, SESSION_CONFIG.md
 *   "webhook_url": "https://agent.com/cb"      // optional — POST result there when done
 * }
 *
 * Response (202):
 * {
 *   "jobId": "fg_...",
 *   "status": "pending",
 *   "statusUrl": "/api/v1/jobs/fg_...",
 *   "etaMinutes": 35
 * }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withX402Payment, type X402RequestContext } from "@/lib/x402-server";
import { runPreflight } from "@/lib/x402-preflight";
import { createServiceRoleClient } from "@/lib/supabase-server";
import {
  SESSION_CONFIG_PROFILES,
  SESSION_CONFIG_BUDGETS,
  SESSION_CONFIG_TIMELINES,
  SESSION_CONFIG_REVENUE_THRESHOLDS,
  serializeSessionConfig,
} from "@/lib/session-config";

// Structured form — preferred for agents (LLMs picking enum values is
// far more reliable than them constructing the markdown by hand).
const sessionConfigObject = z.object({
  profile: z.enum(SESSION_CONFIG_PROFILES).optional(),
  budget: z.enum(SESSION_CONFIG_BUDGETS).optional(),
  timeline: z.enum(SESSION_CONFIG_TIMELINES).optional(),
  revenue_threshold: z.enum(SESSION_CONFIG_REVENUE_THRESHOLDS).optional(),
  founder_signal: z.string().max(2000).optional(),
}).strict();

const bodySchema = z.object({
  sectors: z.array(z.string().max(100)).max(10).optional().default([]),
  context: z.string().max(10000).optional().default(""),
  product_modes: z.array(z.string().max(100)).max(20).optional().default([]),
  // SESSION_CONFIG the agent wants Forge to calibrate against. Accepts EITHER:
  //   (a) structured object {profile, budget, timeline, revenue_threshold,
  //       founder_signal} with enum-validated values — preferred form,
  //       OpenAPI lists the legal values explicitly.
  //   (b) raw SESSION_CONFIG.md markdown string — backward-compatible with
  //       agents already in production that build the markdown by hand.
  // Either way the engine sees the same canonical markdown internally.
  // Empty/omitted falls back to default Small Team / $10K / 4-8 weeks / $100K.
  session_config: z.union([z.string().max(5000), sessionConfigObject]).optional(),
  webhook_url: z.string().url().max(500).optional(),
});

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";
// Server-side LLM credentials used for agent runs (no BYOK in v1)
const AGENT_LLM_PROVIDER = process.env.AGENT_LLM_PROVIDER || "minimax";
const AGENT_LLM_MODEL = process.env.AGENT_LLM_MODEL || "MiniMax-M2.7";
const AGENT_LLM_KEY = process.env.AGENT_LLM_KEY || "";

async function handler(request: Request, ctx: X402RequestContext): Promise<Response> {
  if (!AGENT_LLM_KEY) {
    return NextResponse.json(
      { error: "Agent compute API not configured (missing AGENT_LLM_KEY)" },
      { status: 503 },
    );
  }

  // Body is pre-validated by withX402Payment's validateBody hook (see config
  // below) so an invalid payload returns 422 BEFORE the agent ever pays.
  // ctx.validatedBody is guaranteed to satisfy bodySchema once we reach here.
  const body = ctx.validatedBody as z.infer<typeof bodySchema>;

  const sb = createServiceRoleClient();

  // Normalize structured object into the canonical SESSION_CONFIG.md
  // markdown before persisting / forwarding. String form passes through.
  const sessionConfigMarkdown = typeof body.session_config === "string"
    ? body.session_config
    : serializeSessionConfig(body.session_config);

  // 1. Create a forge_sessions row (engine writes progress + final result here).
  //    user_id is NULL for agent runs — we identify by agent_job_id linkage.
  //    Since forge_sessions.user_id is NOT NULL, use a placeholder UUID per docs.
  const AGENT_PSEUDO_USER = process.env.AGENT_PSEUDO_USER_ID || "00000000-0000-0000-0000-000000000aa1";
  const { data: forgeRow, error: forgeErr } = await sb
    .from("forge_sessions")
    .insert({
      user_id: AGENT_PSEUDO_USER,
      status: "pending",
      session_config: sessionConfigMarkdown,
    })
    .select("id")
    .single();

  if (forgeErr || !forgeRow) {
    console.error("forge_sessions insert failed:", forgeErr?.message);
    return NextResponse.json({ error: "Failed to start session" }, { status: 500 });
  }

  // 2. Update agent_jobs row with webhook_url + linked forge session
  await sb
    .from("agent_jobs")
    .update({
      webhook_url: body.webhook_url ?? null,
      result: { forge_session_id: forgeRow.id },  // initial; engine overwrites with full result on completion
    })
    .eq("id", ctx.jobId);

  // 3. Fire-and-forget POST to engine. Engine reads agent_job_id and mirrors progress.
  //    We don't await this — engine BackgroundTasks handles it; we just need to ensure
  //    the request reaches the engine before we return 202.
  const enginePayload = {
    session_id: forgeRow.id,
    user_id: AGENT_PSEUDO_USER,
    context: buildContext(body),
    api_key: AGENT_LLM_KEY,
    provider: AGENT_LLM_PROVIDER,
    model: AGENT_LLM_MODEL,
    // Engine's RunForgeRequest expects session_config: str — we normalize the
    // structured-object form to markdown earlier (see sessionConfigMarkdown above).
    // Sending the raw body.session_config when it's an object would fail Pydantic
    // validation with 422 Unprocessable Entity.
    session_config: sessionConfigMarkdown,
    agent_job_id: ctx.jobId,
  };

  fetch(`${ENGINE_URL}/api/engine/forge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(enginePayload),
  }).catch((e) => {
    console.error("Engine dispatch failed:", e);
    // Mark job failed so polling reflects it
    sb.from("agent_jobs")
      .update({ status: "failed", error: `Engine dispatch failed: ${e}`, completed_at: new Date().toISOString() })
      .eq("id", ctx.jobId)
      .then(() => {});
  });

  return NextResponse.json(
    {
      jobId: ctx.jobId,
      status: "pending",
      statusUrl: `/api/v1/jobs/${ctx.jobId}`,
      etaMinutes: 35,
      forgeSessionId: forgeRow.id,
    },
    { status: 202 },
  );
}

function buildContext(body: z.infer<typeof bodySchema>): string {
  const parts: string[] = [];
  if (body.sectors.length > 0) parts.push(`Sectors: ${body.sectors.join(", ")}`);
  if (body.product_modes.length > 0) parts.push(`Product modes: ${body.product_modes.join(", ")}`);
  if (body.context) parts.push(body.context);
  return parts.join("\n\n").slice(0, 9500);
}

export const POST = withX402Payment(handler, {
  description: "Run a full Forge brainstorm (5-round multi-agent ideation, ~30 min). Returns 202 + jobId for async polling.",
  // TEMP: lowered from 15 USDC → 0.10 USDC for hackathon mainnet E2E testing.
  // Revert to BigInt(15_000_000) before public launch.
  priceUsdcAtomic: BigInt(100_000), // 0.10 USDC (TEMP — was 15 USDC)
  async: true,
  maxTimeoutSeconds: 60, // for 402 negotiation only — actual job runs ~30 min
  // Pre-payment body validation: agents posting an invalid body (wrong
  // session_config enum, missing fields, etc.) get 422 immediately so they
  // never burn 15 USDC on a request that would be rejected after settlement.
  validateBody: (raw) => {
    const r = bodySchema.safeParse(raw);
    return r.success
      ? { ok: true, body: r.data }
      : { ok: false, errors: r.error.flatten() };
  },
  // System-health preflight: refuse to advertise 402 if MiniMax (the
  // server-side LLM we use for agent runs) is down. Costs ~$0.0001 per
  // miss; cached 30s by runPreflight. If the engine itself is unreachable
  // or the LLM ping fails, agent gets 503 + Retry-After and never signs
  // a USDC tx for a job we can't fulfill.
  preflight: async () => {
    if (!AGENT_LLM_KEY) {
      return { ok: false, reason: "AGENT_LLM_KEY not configured", errorClass: "config", retryAfterSeconds: 600 };
    }
    const r = await runPreflight({
      provider: AGENT_LLM_PROVIDER,
      model: AGENT_LLM_MODEL,
      apiKey: AGENT_LLM_KEY,
      // Forge ideation uses Tavily extensively for competitor / pricing
      // / counter-evidence searches. Run with check_search=true so a
      // Tavily outage gets surfaced even though pipeline degrades
      // gracefully without it.
      checkSearch: true,
    });
    if (r.ok) return { ok: true };
    return {
      ok: false,
      reason: r.error ?? "preflight failed",
      errorClass: r.errorClass,
      retryAfterSeconds: r.errorClass === "config" ? 600 : 30,
    };
  },
});
