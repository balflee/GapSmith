/**
 * GET /api/v1/scout/trends
 *
 * Returns trend signals — emerging market shifts surfaced by recent Scout
 * runs. Synchronous, cache-only. Paid via x402: 0.10 USDC.
 *
 * Query params:
 *   - sector (string, optional): filter to a specific sector tag
 *   - days (int, optional, default 7, max 30): only include reports newer than N days
 *   - limit (int, optional, default 20, max 100)
 *
 * Response (200): { trends: TrendItem[], count, since, sector }
 */

import { NextResponse } from "next/server";
import { withX402Payment, type X402RequestContext } from "@/lib/x402-server";
import { createServiceRoleClient } from "@/lib/supabase-server";

interface TrendItem {
  title?: string;
  description?: string;
  velocity?: string;
  source?: string;
  [k: string]: unknown;
}

interface ScoutReport {
  id: string;
  sectors: unknown;
  trends: TrendItem[];
  created_at: string;
}

async function handler(request: Request, _ctx: X402RequestContext): Promise<Response> {
  const url = new URL(request.url);
  const sectorFilter = url.searchParams.get("sector")?.toLowerCase();
  const daysRaw = parseInt(url.searchParams.get("days") ?? "7", 10);
  const days = Math.min(Math.max(1, isNaN(daysRaw) ? 7 : daysRaw), 30);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 20 : limitRaw), 100);

  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const sb = createServiceRoleClient();
  const { data: reports, error } = await sb
    .from("scout_reports")
    .select("id, sectors, trends, created_at")
    .eq("status", "complete")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Failed to load trends" }, { status: 500 });
  }

  const all: TrendItem[] = [];
  for (const r of (reports ?? []) as ScoutReport[]) {
    const sectors = Array.isArray(r.sectors) ? r.sectors.map((s) => String(s).toLowerCase()) : [];
    if (sectorFilter && !sectors.includes(sectorFilter)) continue;
    for (const t of r.trends ?? []) {
      all.push(t);
      if (all.length >= limit) break;
    }
    if (all.length >= limit) break;
  }

  return NextResponse.json({
    trends: all,
    count: all.length,
    since: sinceIso,
    sector: sectorFilter ?? null,
  });
}

export const GET = withX402Payment(handler, {
  description: "Scout trend intelligence — emerging market signals from recent multi-source scans",
  priceUsdcAtomic: BigInt(100_000), // 0.10 USDC
});
