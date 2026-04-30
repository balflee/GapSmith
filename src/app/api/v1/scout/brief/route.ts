/**
 * GET /api/v1/scout/brief
 *
 * Returns the latest daily executive brief — overview, takeaway, sector
 * heatmap, narratives, cross-signals. This is the analyst-grade synthesis
 * of recent multi-source scans, the richest single-call data we offer.
 *
 * Synchronous, cache-only. Paid via x402: 0.20 USDC (highest of the Data
 * API tier — densest payload, most LLM-curated content).
 *
 * Response (200):
 * {
 *   brief: {
 *     date: string,
 *     overview: string,           // narrative paragraph
 *     takeaway: string,
 *     stats: {...},
 *     top_articles: [...],
 *     sector_heatmap: {...},
 *     narratives: [...],
 *     cross_signals: [...]
 *   },
 *   generatedFrom: ISO_date,
 *   sectors: string[]
 * }
 */

import { NextResponse } from "next/server";
import { withX402Payment, type X402RequestContext } from "@/lib/x402-server";
import { createServiceRoleClient } from "@/lib/supabase-server";

interface ScoutReportRow {
  id: string;
  sectors: unknown;
  daily_brief: unknown;
  created_at: string;
}

function parseBrief(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return { overview: raw }; // legacy markdown
    }
  }
  return null;
}

async function handler(_request: Request, _ctx: X402RequestContext): Promise<Response> {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("scout_reports")
    .select("id, sectors, daily_brief, created_at")
    .eq("status", "complete")
    .not("daily_brief", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load brief" }, { status: 500 });
  }
  const row = data as ScoutReportRow | null;
  if (!row) {
    return NextResponse.json({ error: "No completed brief available yet" }, { status: 404 });
  }

  const brief = parseBrief(row.daily_brief);
  if (!brief) {
    return NextResponse.json({ error: "Brief data malformed" }, { status: 500 });
  }

  return NextResponse.json({
    brief,
    generatedFrom: row.created_at,
    sectors: Array.isArray(row.sectors) ? row.sectors : [],
  });
}

export const GET = withX402Payment(handler, {
  description: "Scout daily executive brief — analyst-grade synthesis: overview, takeaway, sector heatmap, narratives, cross-signals",
  priceUsdcAtomic: BigInt(200_000), // 0.20 USDC — densest data, highest tier
});
