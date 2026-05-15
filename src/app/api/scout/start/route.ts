import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { decrypt } from "@/lib/crypto";
import { userOwnsSku } from "@/lib/access";
import { inferProviderFromModel } from "@/lib/model-provider";
import { isTrialOnly, getTrialKeyset } from "@/lib/trial";

export const startScoutSchema = z.object({
  sectors: z.array(z.string().max(200)).min(1).max(10),
  model: z.string().max(200).optional(),
  focus_keywords: z.array(z.string().max(100)).max(10).optional(),
});

export type StartScoutResponse = { id: string };

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Defense-in-depth: middleware also gates this, but route-level check protects against
  // direct API calls that bypass the page route.
  if (!(await userOwnsSku(supabase, user.id, "scout"))) {
    return NextResponse.json({ error: "Scout access required", unlock: "scout" }, { status: 403 });
  }

  // Annual quota gate — returns 402 when exhausted, frontend redirects to
  // /pricing#done-for-you upsell ($39 Scout Run with Claude Opus + human review).
  const { data: quotaResult } = await supabase.rpc("consume_quota", {
    user_id_in: user.id,
    sku_in: "scout",
  });
  if (quotaResult && !quotaResult.ok) {
    return NextResponse.json(
      {
        error: "Annual Scout quota exhausted",
        reason: "quota_exhausted",
        used: quotaResult.used,
        total: quotaResult.total,
        upsell_url: "/pricing#done-for-you",
        upsell_label: "Order a Scout Run ($39, Claude Opus + human-reviewed)",
        sku: "scout",
      },
      { status: 402 },
    );
  }

  // Rate limit AI-calling routes: 5 req/min
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`scout-start:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json();
    const { sectors, model, focus_keywords } = startScoutSchema.parse(body);

    // Trial-only users (signed up via /free-trial, never paid) don't have
    // an api_keys row — they run on the company-funded MiniMax key. Detect
    // that here so the BYOK check below doesn't dead-end them with
    // "no_api_key". A user who later upgrades to a paid tier gets a
    // non-trial purchase, isTrialOnly() flips false, and the BYOK path
    // takes over without code changes.
    const trialOnly = await isTrialOnly(supabase, user.id);
    let apiKey: string;
    let provider: string;
    let modelToUse: string;

    if (trialOnly) {
      const trialKeys = getTrialKeyset();
      if (!trialKeys) {
        return NextResponse.json({
          error: "Trial mode is not configured on this server. Please configure your own API key in Settings.",
          reason: "trial_unavailable",
          redirect_to: "/settings",
        }, { status: 503 });
      }
      apiKey = trialKeys.apiKey;
      provider = trialKeys.provider;
      modelToUse = trialKeys.model;
    } else {
      // Pick the BYOK row that matches the chosen model's provider. Falls
      // back to whatever the user has saved if the model isn't recognized.
      const wantProvider = inferProviderFromModel(model);
      let keyQuery = supabase
        .from("api_keys")
        .select("encrypted_key, provider, model")
        .eq("user_id", user.id);
      if (wantProvider) keyQuery = keyQuery.eq("provider", wantProvider);
      const { data: keyRow } = await keyQuery.limit(1).maybeSingle();

      if (!keyRow) {
        return NextResponse.json({
          error: wantProvider
            ? `No ${wantProvider} API key configured for this model. Go to Settings first.`
            : "No API key configured. Go to Settings first.",
          reason: "no_api_key",
          redirect_to: "/settings",
          missing_provider: wantProvider,
        }, { status: 400 });
      }

      apiKey = await decrypt(keyRow.encrypted_key);
      provider = keyRow.provider;
      modelToUse = model || keyRow.model || "gpt-5.4";
    }

    // Create session record
    const { data, error } = await supabase
      .from("scout_reports")
      .insert({
        user_id: user.id,
        sectors,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Scout report creation error:", error.message);
      return NextResponse.json({ error: "Failed to create scout report" }, { status: 500 });
    }

    // Dispatch to Python engine (fire-and-forget)
    fetch(`${ENGINE_URL}/api/engine/scout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: data.id,
        user_id: user.id,
        sectors,
        api_key: apiKey,
        provider,
        model: modelToUse,
        focus_keywords: focus_keywords || [],
      }),
    }).catch((err) => {
      console.error("Engine dispatch error:", err);
      // Update status to error if engine is unreachable
      supabase.from("scout_reports").update({ status: "error" }).eq("id", data.id);
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Scout start error:", error);
    return NextResponse.json({ error: "Failed to start scout report" }, { status: 500 });
  }
}
