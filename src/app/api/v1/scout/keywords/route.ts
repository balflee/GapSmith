/**
 * GET /api/v1/scout/keywords
 *
 * Returns keyword intelligence — terms with notable frequency or velocity
 * across recent Scout scans. Synchronous, cache-only. Paid via x402: 0.05 USDC
 * (cheaper than other Data API endpoints — keyword data is lighter).
 *
 * Query params:
 *   - sector (string, optional): filter to a specific sector tag
 *   - limit (int, optional, default 50, max 200)
 *
 * Response (200): { keywords: [{keyword, count}], count, generatedFrom, sector }
 */

import { NextResponse } from "next/server";
import { withX402Payment, type X402RequestContext } from "@/lib/x402-server";
import { createServiceRoleClient } from "@/lib/supabase-server";

interface KeywordItem {
  keyword?: string;
  count?: number;
  [k: string]: unknown;
}

interface ScoutReport {
  id: string;
  sectors: unknown;
  keywords: KeywordItem[];
  created_at: string;
}

async function handler(request: Request, _ctx: X402RequestContext): Promise<Response> {
  const url = new URL(request.url);
  const sectorFilter = url.searchParams.get("sector")?.toLowerCase();
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);

  const sb = createServiceRoleClient();
  const { data: reports, error } = await sb
    .from("scout_reports")
    .select("id, sectors, keywords, created_at")
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Failed to load keywords" }, { status: 500 });
  }

  // Aggregate keyword counts across reports (deduplicated by keyword text)
  const counts = new Map<string, number>();
  let latestReportTime = "";
  for (const r of (reports ?? []) as ScoutReport[]) {
    if (!latestReportTime || r.created_at > latestReportTime) latestReportTime = r.created_at;
    const sectors = Array.isArray(r.sectors) ? r.sectors.map((s) => String(s).toLowerCase()) : [];
    if (sectorFilter && !sectors.includes(sectorFilter)) continue;
    for (const k of r.keywords ?? []) {
      const key = String(k.keyword ?? "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + (Number(k.count) || 1));
    }
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));

  return NextResponse.json({
    keywords: sorted,
    count: sorted.length,
    generatedFrom: latestReportTime || null,
    sector: sectorFilter ?? null,
  });
}

export const GET = withX402Payment(handler, {
  description: "Scout keyword intelligence — top terms ranked by aggregate occurrence",
  priceUsdcAtomic: BigInt(50_000), // 0.05 USDC
});
