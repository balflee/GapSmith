import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { decrypt } from "@/lib/crypto";
import { userOwnsSku } from "@/lib/access";
import { inferProviderFromModel } from "@/lib/model-provider";

export const startForgeSchema = z.object({
  scout_report_id: z.string().uuid().optional(),
  context: z.string().max(10000).optional(),
  product_modes: z.array(z.string().max(100)).max(20).optional(),
  model: z.string().max(200).optional(),
  session_config: z.string().max(5000).optional(),
});

export type StartForgeResponse = { id: string };

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await userOwnsSku(supabase, user.id, "forge"))) {
    return NextResponse.json({ error: "Forge access required", unlock: "forge" }, { status: 403 });
  }

  const { data: quotaResult } = await supabase.rpc("consume_quota", {
    user_id_in: user.id,
    sku_in: "forge",
  });
  if (quotaResult && !quotaResult.ok) {
    return NextResponse.json(
      {
        error: "Annual Forge quota exhausted",
        reason: "quota_exhausted",
        used: quotaResult.used,
        total: quotaResult.total,
        upsell_url: "/pricing#done-for-you",
        upsell_label: "Order a Forge Run ($99, Claude Opus + human-reviewed)",
        sku: "forge",
      },
      { status: 402 },
    );
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`forge-start:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json();
    const { scout_report_id, context, product_modes, model, session_config } = startForgeSchema.parse(body);

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

    // Build context: product modes + user context or scout report
    const parts: string[] = [];

    // Product modes (always included if specified)
    if (product_modes && product_modes.length > 0) {
      parts.push(`## Product Modes\nIdeas MUST be one of these product types: ${product_modes.join(", ")}`);
    }

    if (context) {
      parts.push(context);
    } else if (scout_report_id) {
      const { data: report } = await supabase
        .from("scout_reports")
        .select("gaps, pain_clusters, trends, daily_brief, topics")
        .eq("id", scout_report_id)
        .single();
      if (report) {
        // Use daily_brief + topics if available (richer than raw JSON)
        if (report.daily_brief) {
          parts.push(`## Scout Daily Brief\n${report.daily_brief}`);
        }
        if (report.topics) {
          parts.push(`## Scout Topics\n${report.topics}`);
        }
        if (!report.daily_brief && !report.topics) {
          parts.push(JSON.stringify({ gaps: report.gaps, pain_clusters: report.pain_clusters, trends: report.trends }));
        }
      }
    }

    const forgeContext = parts.join("\n\n");

    const { data, error } = await supabase
      .from("forge_sessions")
      .insert({
        user_id: user.id,
        scout_report_id: scout_report_id ?? null,
        status: "pending",
        session_config: session_config || "",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Forge session creation error:", error.message);
      return NextResponse.json({ error: "Failed to create forge session" }, { status: 500 });
    }

    // Dispatch to Python engine
    fetch(`${ENGINE_URL}/api/engine/forge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: data.id,
        user_id: user.id,
        context: forgeContext,
        api_key: apiKey,
        provider: keyRow.provider,
        model: model || keyRow.model || "gpt-5.4",
        session_config: session_config || "",
      }),
    }).catch((err) => {
      console.error("Engine dispatch error:", err);
      supabase.from("forge_sessions").update({ status: "error" }).eq("id", data.id);
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Forge start error:", error);
    return NextResponse.json({ error: "Failed to start forge session" }, { status: 500 });
  }
}
