import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { decrypt } from "@/lib/crypto";
import { userOwnsSku } from "@/lib/access";
import { inferProviderFromModel } from "@/lib/model-provider";

export const startProveSchema = z.object({
  idea: z.string().min(1).max(10000),
  model: z.string().max(200).optional(),
  session_config: z.string().max(5000).optional(),
});

export type StartProveResponse = { id: string };

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await userOwnsSku(supabase, user.id, "prove"))) {
    return NextResponse.json({ error: "Prove access required", unlock: "prove" }, { status: 403 });
  }

  const { data: quotaResult } = await supabase.rpc("consume_quota", {
    user_id_in: user.id,
    sku_in: "prove",
  });
  if (quotaResult && !quotaResult.ok) {
    return NextResponse.json(
      {
        error: "Annual Prove quota exhausted",
        reason: "quota_exhausted",
        used: quotaResult.used,
        total: quotaResult.total,
        upsell_url: "/pricing#done-for-you",
        upsell_label: "Order a Prove Run ($149, Claude Opus + human-reviewed)",
        sku: "prove",
      },
      { status: 402 },
    );
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`prove-start:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json();
    const { idea, model, session_config } = startProveSchema.parse(body);

    // Pick the BYOK row matching the chosen model's provider so users with
    // multiple keys (e.g. Claude + OpenAI) get routed correctly.
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

    const apiKey = await decrypt(keyRow.encrypted_key);

    const { data, error } = await supabase
      .from("prove_sessions")
      .insert({
        user_id: user.id,
        idea,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Prove session creation error:", error.message);
      return NextResponse.json({ error: "Failed to create prove session" }, { status: 500 });
    }

    // Dispatch to Python engine
    fetch(`${ENGINE_URL}/api/engine/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: data.id,
        user_id: user.id,
        idea,
        api_key: apiKey,
        provider: keyRow.provider,
        model: model || keyRow.model || "gpt-5.4",
        session_config: session_config || "",
      }),
    }).catch((err) => {
      console.error("Engine dispatch error:", err);
      supabase.from("prove_sessions").update({ status: "error" }).eq("id", data.id);
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Prove start error:", error);
    return NextResponse.json({ error: "Failed to start prove session" }, { status: 500 });
  }
}
