/**
 * GET /api/v1/scout/gaps
 *
 * Returns synthesized venture opportunities from recent Scout runs. Each gap
 * is a fully-formed business angle: title + trend signal (why now) + pain
 * signals (who has the problem). This is the actual high-value output of
 * the multi-agent Scout pipeline — not raw scored news.
 *
 * Synchronous, cache-only (no LLM call). Paid via x402: 0.10 USDC.
 *
 * Query params:
 *   - sector (string, optional): filter to a specific sector tag
 *   - limit (int, optional, default 10, max 50): max gaps to return
 *
 * Response (200):
 * {
 *   gaps: [{
 *     title: "AI Agent Certification Layer for Enterprise Deployment",
 *     trend_signal: { article, source, score, insight },
 *     pain_signals: [{ theme, severity, signal_count, description }],
 *     ...other fields from the Scout pipeline
 *   }],
 *   count: number,
 *   generatedFrom: ISO_date,
 *   sector: string|null
 * }
 */

import { NextResponse } from "next/server";
import { withX402Payment, type X402RequestContext } from "@/lib/x402-server";
import { createServiceRoleClient } from "@/lib/supabase-server";

interface ScoutReportRow {
  id: string;
  sectors: unknown;
  topics: unknown;        // JSON string OR parsed array, depending on writer
  gaps: unknown[];        // legacy fallback
  created_at: string;
}

function parseTopics(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

async function handler(request: Request, _ctx: X402RequestContext): Promise<Response> {
  const url = new URL(request.url);
  const sectorFilter = url.searchParams.get("sector")?.toLowerCase();
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "10", 10);
  const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 10 : limitRaw), 50);

  const sb = createServiceRoleClient();
  const { data: reports, error } = await sb
    .from("scout_reports")
    .select("id, sectors, topics, gaps, created_at")
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("/api/v1/scout/gaps DB error:", error.message);
    return NextResponse.json({ error: "Failed to load gaps" }, { status: 500 });
  }

  const allGaps: Record<string, unknown>[] = [];
  let latestReportTime = "";
  for (const r of (reports ?? []) as ScoutReportRow[]) {
    if (!latestReportTime || r.created_at > latestReportTime) latestReportTime = r.created_at;
    const sectors = Array.isArray(r.sectors) ? r.sectors.map((s) => String(s).toLowerCase()) : [];
    if (sectorFilter && !sectors.includes(sectorFilter)) continue;
    // Prefer topics (synthesized opportunities), fall back to gaps (raw scored news)
    let items = parseTopics(r.topics);
    if (items.length === 0) items = (r.gaps ?? []) as Record<string, unknown>[];
    for (const g of items) {
      allGaps.push(g);
      if (allGaps.length >= limit) break;
    }
    if (allGaps.length >= limit) break;
  }

  return NextResponse.json({
    gaps: allGaps,
    count: allGaps.length,
    generatedFrom: latestReportTime || null,
    sector: sectorFilter ?? null,
  });
}

export const GET = withX402Payment(handler, {
  description: "Scout synthesized venture opportunities — title + trend signal + pain signals from multi-agent scans",
  priceUsdcAtomic: BigInt(100_000), // 0.10 USDC
});
