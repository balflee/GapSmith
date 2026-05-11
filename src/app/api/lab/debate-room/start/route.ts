/**
 * POST /api/lab/debate-room/start
 *
 * Start a multi-LLM (mixed-model) Prove debate where each persona runs
 * on a separately-chosen LLM. Each user-selected model needs a matching
 * BYOK key in api_keys; we resolve all of them per-request and push
 * decrypted keys to the engine in-memory only (never persisted).
 *
 * Free for testing — no quota gating (lab is not part of the Prove
 * quota system). New rows go into lab_sessions (separate from
 * prove_sessions) so multi-LLM experimentation doesn't pollute the
 * production Prove dataset.
 *
 * Request body:
 * {
 *   "idea": "...",                                // required, ≤10000 chars
 *   "persona_models": {                           // required, 6 personas
 *     "proposer":   "claude-opus-4-7",
 *     "challenger": "gpt-5.5",
 *     "analyst":    "gemini-3.1-pro-preview",
 *     "reviewer":   "claude-sonnet-4-6",
 *     "defender":   "MiniMax-M2.7",
 *     "strategist": "claude-opus-4-7"
 *   },
 *   "session_config": "..."                       // optional, ≤5000 chars
 * }
 *
 * Response:  { id: lab_session_id }                       on success
 *            { reason: "no_api_key", missing_providers: [...] }   on missing keys
 *            { error: "Invalid request", details: ... }   on validation fail
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { decrypt } from "@/lib/crypto";
import { userOwnsSku } from "@/lib/access";
import { inferProviderFromModel } from "@/lib/model-provider";

// 6 main personas that the engine's run_debate orchestrates. Sub-agents
// (trend_scout, benchmark_hunter, evidence_hunter, contrarian, gap_finder)
// inherit from their parent persona via SUB_AGENT_INHERITS in the engine.
const PERSONAS = ["proposer", "challenger", "analyst", "reviewer", "defender", "strategist"] as const;
type Persona = typeof PERSONAS[number];

const personaModelsSchema = z.object({
  proposer:   z.string().min(1).max(200),
  challenger: z.string().min(1).max(200),
  analyst:    z.string().min(1).max(200),
  reviewer:   z.string().min(1).max(200),
  defender:   z.string().min(1).max(200),
  strategist: z.string().min(1).max(200),
}).strict();

const startLabSchema = z.object({
  idea: z.string().min(10).max(10000),
  persona_models: personaModelsSchema,
  session_config: z.string().max(5000).optional(),
});

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Lab requires Prove ownership — same gate as /prove. We don't want
  // to introduce a new SKU for the experimental playground; users who
  // already paid for Prove get the lab as a free perk. If you don't own
  // Prove, route to /pricing#prove (consistent with /prove behavior).
  if (!(await userOwnsSku(supabase, user.id, "prove"))) {
    return NextResponse.json(
      { error: "Lab debate requires Prove access", unlock: "prove" },
      { status: 403 },
    );
  }

  // Rate limit — same per-IP cap as /prove/start to avoid wallpaper-running.
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`lab-start:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = startLabSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { idea, persona_models, session_config } = parsed.data;

  // 1. Resolve which providers we need keys for, dedup so we make one
  //    api_keys lookup per provider (most users will reuse a single key
  //    across many personas). Bail loud if any model maps to an unknown
  //    provider — better than silently routing to OpenAI as fallback.
  const providersByPersona: Record<Persona, string> = {} as Record<Persona, string>;
  const missingProviderForPersona: Persona[] = [];
  for (const persona of PERSONAS) {
    const model = persona_models[persona];
    const provider = inferProviderFromModel(model);
    if (!provider) {
      missingProviderForPersona.push(persona);
    } else {
      providersByPersona[persona] = provider;
    }
  }
  if (missingProviderForPersona.length > 0) {
    return NextResponse.json({
      error: "Could not infer provider from model name",
      reason: "unknown_model",
      personas: missingProviderForPersona,
      hint: "Each model name must start with a known prefix: claude-, gpt-, gemini-, deepseek-, minimax-, qwen-, grok-",
    }, { status: 400 });
  }

  const uniqueProviders = Array.from(new Set(Object.values(providersByPersona)));

  // 2. Fetch all api_keys rows for this user matching any provider we need.
  //    Single round-trip; we then index by provider in JS.
  const { data: keyRows, error: keyErr } = await supabase
    .from("api_keys")
    .select("encrypted_key, provider")
    .eq("user_id", user.id)
    .in("provider", uniqueProviders);
  if (keyErr) {
    console.error("api_keys fetch error:", keyErr.message);
    return NextResponse.json({ error: "Failed to read API keys" }, { status: 500 });
  }

  const keyByProvider: Record<string, string> = {};
  for (const row of keyRows || []) {
    if (row.encrypted_key && row.provider) {
      keyByProvider[row.provider] = row.encrypted_key;
    }
  }

  const missingProviders = uniqueProviders.filter(p => !keyByProvider[p]);
  if (missingProviders.length > 0) {
    // Build a per-persona map of who's missing what so the UI can
    // surface "your Reviewer needs an Anthropic key" rather than a
    // generic missing-key message.
    const personaMissing: { persona: Persona; provider: string; model: string }[] = [];
    for (const persona of PERSONAS) {
      const provider = providersByPersona[persona];
      if (missingProviders.includes(provider)) {
        personaMissing.push({ persona, provider, model: persona_models[persona] });
      }
    }
    return NextResponse.json({
      error: `Missing API keys for: ${missingProviders.join(", ")}. Add them in Settings before starting a multi-LLM debate.`,
      reason: "no_api_key",
      missing_providers: missingProviders,
      missing_by_persona: personaMissing,
      redirect_to: "/settings",
    }, { status: 400 });
  }

  // 3. Decrypt all keys we need (parallel — independent ops).
  const decryptedByProvider: Record<string, string> = {};
  await Promise.all(uniqueProviders.map(async (p) => {
    decryptedByProvider[p] = await decrypt(keyByProvider[p]);
  }));

  // 4. Build the per-persona engine config: each persona gets its model
  //    + matching provider + decrypted key. Engine's create_multi_providers
  //    constructs a separate LiteLLMProvider per persona from this.
  const model_overrides: Record<Persona, { provider: string; model: string; api_key: string }> =
    {} as Record<Persona, { provider: string; model: string; api_key: string }>;
  for (const persona of PERSONAS) {
    const provider = providersByPersona[persona];
    model_overrides[persona] = {
      provider,
      model: persona_models[persona],
      api_key: decryptedByProvider[provider],
    };
  }

  // 5. Insert lab_sessions row first so we have an ID to dispatch with.
  //    Engine writes progress/rounds/report back to this row via
  //    update_progress / save_prove_results(table='lab_sessions').
  const { data: labRow, error: labErr } = await supabase
    .from("lab_sessions")
    .insert({
      user_id: user.id,
      idea,
      persona_models,
      status: "pending",
    })
    .select("id")
    .single();
  if (labErr || !labRow) {
    console.error("lab_sessions insert error:", labErr?.message);
    return NextResponse.json({ error: "Failed to create lab session" }, { status: 500 });
  }

  // 6. Dispatch to Python engine. Top-level provider/model/api_key fields
  //    are required by the existing RunProveRequest pydantic schema but
  //    are ignored when model_overrides is set — we send the proposer's
  //    config as the "default" so logging / error paths have something.
  const proposerCfg = model_overrides.proposer;
  fetch(`${ENGINE_URL}/api/engine/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: labRow.id,
      user_id: user.id,
      idea,
      // Default fields (ignored by engine when model_overrides is non-empty,
      // but pydantic still requires them):
      api_key: proposerCfg.api_key,
      provider: proposerCfg.provider,
      model: proposerCfg.model,
      session_config: session_config || "",
      // Multi-LLM mode: tells the engine to build a per-persona bundle
      // and route writes to lab_sessions instead of prove_sessions.
      model_overrides,
      session_table: "lab_sessions",
    }),
  }).catch((err) => {
    console.error("Engine dispatch error:", err);
    supabase.from("lab_sessions").update({ status: "error", progress_message: `Engine dispatch failed: ${err}` }).eq("id", labRow.id);
  });

  return NextResponse.json({ id: labRow.id });
}
