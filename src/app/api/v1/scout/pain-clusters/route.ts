/**
 * GET /api/v1/scout/pain-clusters
 *
 * Returns pain cluster intelligence — themes of complaints and frustrations
 * surfaced across Reddit / HN / Product Hunt / forums by recent Scout runs.
 * Synchronous, cache-only. Paid via x402: 0.10 USDC.
 *
 * Query params:
 *   - sector (string, optional): filter to a specific sector tag
 *   - limit (int, optional, default 20, max 100)
 *
 * Response (200): { painClusters: PainCluster[], count, generatedFrom, sector }
 */

import { NextResponse } from "next/server";
import { withX402Payment, type X402RequestContext } from "@/lib/x402-server";
import { createServiceRoleClient } from "@/lib/supabase-server";

interface PainCluster {
  theme?: string;
  description?: string;
  mentions?: number;
  intensity?: string;
  [k: string]: unknown;
}

interface ScoutReport {
  id: string;
  sectors: unknown;
  pain_clusters: PainCluster[];
  created_at: string;
}

async function handler(request: Request, _ctx: X402RequestContext): Promise<Response> {
  const url = new URL(request.url);
  const sectorFilter = url.searchParams.get("sector")?.toLowerCase();
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 20 : limitRaw), 100);

  const sb = createServiceRoleClient();
  const { data: reports, error } = await sb
    .from("scout_reports")
    .select("id, sectors, pain_clusters, created_at")
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Failed to load pain clusters" }, { status: 500 });
  }

  const all: PainCluster[] = [];
  let latestReportTime = "";
  for (const r of (reports ?? []) as ScoutReport[]) {
    if (!latestReportTime || r.created_at > latestReportTime) latestReportTime = r.created_at;
    const sectors = Array.isArray(r.sectors) ? r.sectors.map((s) => String(s).toLowerCase()) : [];
    if (sectorFilter && !sectors.includes(sectorFilter)) continue;
    for (const c of r.pain_clusters ?? []) {
      all.push(c);
      if (all.length >= limit) break;
    }
    if (all.length >= limit) break;
  }

  return NextResponse.json({
    painClusters: all,
    count: all.length,
    generatedFrom: latestReportTime || null,
    sector: sectorFilter ?? null,
  });
}

export const GET = withX402Payment(handler, {
  description: "Scout pain cluster intelligence — recurring themes from real user complaints",
  priceUsdcAtomic: BigInt(100_000), // 0.10 USDC
});
