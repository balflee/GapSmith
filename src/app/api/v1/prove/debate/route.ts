/**
 * POST /api/v1/prove/debate — x402-paid Prove Compute API.
 *
 * Run a multi-agent debate (6 personas: Proposer, Challenger, Analyst,
 * Reviewer, Defender, Strategist) that stress-tests a single idea with
 * up to 3 rounds of search-augmented argument and final voting.
 *
 * Request body:
 * {
 *   "idea": "AgentMeter — cost governance for AI agents",   // required
 *   "session_config": {                                     // optional, structured (preferred) OR raw markdown
 *     "profile": "Solo",
 *     "budget": "$1K",
 *     "timeline": "3-6 months",
 *     "revenue_threshold": "$50K/year",
 *     "founder_signal": "..."
 *   },
 *   "webhook_url": "https://agent.com/cb"                   // optional — POST result there when done
 * }
 *
 * Response (202):
 * {
 *   "jobId": "fg_...",
 *   "status": "pending",
 *   "statusUrl": "/api/v1/jobs/fg_...",
 *   "etaMinutes": 60
 * }
 *
 * The result payload (delivered via /api/v1/jobs/{id} or webhook) contains:
 *   { verdict, report, rounds, votes, session_id, model }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withX402Payment, type X402RequestContext } from "@/lib/x402-server";
import { createServiceRoleClient } from "@/lib/supabase-server";
import {
  SESSION_CONFIG_PROFILES,
  SESSION_CONFIG_BUDGETS,
  SESSION_CONFIG_TIMELINES,
  SESSION_CONFIG_REVENUE_THRESHOLDS,
  serializeSessionConfig,
} from "@/lib/session-config";

// Same structured form as /forge/ideate so agents that integrate with one
// endpoint can pass identical session_config to the other.
const sessionConfigObject = z.object({
  profile: z.enum(SESSION_CONFIG_PROFILES).optional(),
  budget: z.enum(SESSION_CONFIG_BUDGETS).optional(),
  timeline: z.enum(SESSION_CONFIG_TIMELINES).optional(),
  revenue_threshold: z.enum(SESSION_CONFIG_REVENUE_THRESHOLDS).optional(),
  founder_signal: z.string().max(2000).optional(),
}).strict();

const bodySchema = z.object({
  // Required: the single idea (or product brief) to debate. Multi-line
  // markdown is fine — Prove's Proposer reads this verbatim as the seed.
  idea: z.string().min(10).max(10000),
  // Optional SESSION_CONFIG (object preferred, string accepted for parity
  // with the human Prove path's buildSessionConfig() output).
  session_config: z.union([z.string().max(5000), sessionConfigObject]).optional(),
  webhook_url: z.string().url().max(500).optional(),
});

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";
// Server-side LLM credentials used for agent runs (no BYOK in v1)
const AGENT_LLM_PROVIDER = process.env.AGENT_LLM_PROVIDER || "minimax";
const AGENT_LLM_MODEL = process.env.AGENT_LLM_MODEL || "MiniMax-M2.7";
const AGENT_LLM_KEY = process.env.AGENT_LLM_KEY || "";

async function handler(_request: Request, ctx: X402RequestContext): Promise<Response> {
  if (!AGENT_LLM_KEY) {
    return NextResponse.json(
      { error: "Agent compute API not configured (missing AGENT_LLM_KEY)" },
      { status: 503 },
    );
  }

  // Body is pre-validated by withX402Payment's validateBody hook (see config
  // below) so an invalid payload returns 422 BEFORE the agent ever pays.
  const body = ctx.validatedBody as z.infer<typeof bodySchema>;

  const sb = createServiceRoleClient();

  // Normalize session_config (object → markdown, string passes through).
  const sessionConfigMarkdown = typeof body.session_config === "string"
    ? body.session_config
    : serializeSessionConfig(body.session_config);

  // 1. Create a prove_sessions row (engine writes progress + final result here).
  //    user_id is NOT NULL on the table; agent runs use the same pseudo-user
  //    UUID as forge agent runs.
  const AGENT_PSEUDO_USER = process.env.AGENT_PSEUDO_USER_ID || "00000000-0000-0000-0000-000000000aa1";
  const { data: proveRow, error: proveErr } = await sb
    .from("prove_sessions")
    .insert({
      user_id: AGENT_PSEUDO_USER,
      idea: body.idea,
      status: "pending",
      model: AGENT_LLM_MODEL,
    })
    .select("id")
    .single();

  if (proveErr || !proveRow) {
    console.error("prove_sessions insert failed:", proveErr?.message);
    return NextResponse.json({ error: "Failed to start session" }, { status: 500 });
  }

  // 2. Update agent_jobs row with webhook_url + linked prove session
  await sb
    .from("agent_jobs")
    .update({
      webhook_url: body.webhook_url ?? null,
      result: { prove_session_id: proveRow.id },  // engine overwrites with full result on completion
    })
    .eq("id", ctx.jobId);

  // 3. Fire-and-forget POST to engine. Engine reads agent_job_id and mirrors progress.
  const enginePayload = {
    session_id: proveRow.id,
    user_id: AGENT_PSEUDO_USER,
    idea: body.idea,
    api_key: AGENT_LLM_KEY,
    provider: AGENT_LLM_PROVIDER,
    model: AGENT_LLM_MODEL,
    session_config: sessionConfigMarkdown,
    agent_job_id: ctx.jobId,
  };

  fetch(`${ENGINE_URL}/api/engine/prove`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(enginePayload),
  }).catch((e) => {
    console.error("Engine dispatch failed:", e);
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
      etaMinutes: 60,  // Prove is longer than Forge — 6 personas × 3 rounds + voting
      proveSessionId: proveRow.id,
    },
    { status: 202 },
  );
}

export const POST = withX402Payment(handler, {
  description: "Run a 6-persona Prove debate (multi-round adversarial stress-test of a single idea, ~60 min). Returns 202 + jobId for async polling.",
  // TEMP: lowered from 25 USDC → 0.10 USDC for hackathon mainnet E2E testing.
  // Revert to BigInt(25_000_000) before public launch.
  priceUsdcAtomic: BigInt(100_000), // 0.10 USDC (TEMP — was 25 USDC)
  async: true,
  maxTimeoutSeconds: 60,
  validateBody: (raw) => {
    const r = bodySchema.safeParse(raw);
    return r.success
      ? { ok: true, body: r.data }
      : { ok: false, errors: r.error.flatten() };
  },
});
