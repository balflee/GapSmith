/**
 * GET /api/v1/sectors
 *
 * Free, unauthenticated discovery endpoint. Returns the list of sectors that
 * have at least one cached Scout report — agents call this BEFORE paying for
 * a Data API endpoint, to avoid paying USDC and getting back an empty array.
 *
 * Response (200):
 * {
 *   sectors: [
 *     { sector: "ai-ml", report_count: 3, latest_report: "2026-04-21T...", gaps_count: 10 },
 *     { sector: "healthtech", report_count: 1, latest_report: "...", gaps_count: 5 }
 *   ],
 *   total_reports: 1,
 *   latest_overall: "2026-04-21T..."
 * }
 *
 * Free to call (cached + cheap query). Rate-limited at gateway.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-server";

interface ScoutReportRow {
  id: string;
  sectors: unknown;
  topics: unknown;
  gaps: unknown;
  created_at: string;
}

function parseTopicsCount(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export async function GET() {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("scout_reports")
    .select("id, sectors, topics, gaps, created_at")
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to load sectors" }, { status: 500 });
  }

  const sectorMap = new Map<
    string,
    { report_count: number; latest_report: string; gaps_count: number }
  >();
  let latestOverall = "";

  for (const r of (data ?? []) as ScoutReportRow[]) {
    if (!latestOverall || r.created_at > latestOverall) latestOverall = r.created_at;
    const sectors = Array.isArray(r.sectors) ? r.sectors : [];
    const topicsCount = parseTopicsCount(r.topics) || (Array.isArray(r.gaps) ? r.gaps.length : 0);
    for (const s of sectors) {
      const key = String(s).toLowerCase();
      const existing = sectorMap.get(key);
      if (existing) {
        existing.report_count += 1;
        existing.gaps_count += topicsCount;
        if (r.created_at > existing.latest_report) existing.latest_report = r.created_at;
      } else {
        sectorMap.set(key, {
          report_count: 1,
          latest_report: r.created_at,
          gaps_count: topicsCount,
        });
      }
    }
  }

  const sectors = Array.from(sectorMap.entries())
    .map(([sector, info]) => ({ sector, ...info }))
    .sort((a, b) => (a.latest_report < b.latest_report ? 1 : -1));

  return NextResponse.json({
    sectors,
    total_reports: data?.length ?? 0,
    latest_overall: latestOverall || null,
    note: "Free to call. Use any returned sector value with the ?sector= query param on paid Data API endpoints.",
  });
}
