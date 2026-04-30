import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/quota
 * Returns the authenticated user's annual quota state across all SKUs.
 *
 * Response shape:
 * {
 *   "scout": { used: 3, total: 12, remaining: 9, period_end: "...", has_quota: true },
 *   "forge": { used: 1, total: 6, ... },
 *   "prove": { used: 0, total: 4, ... }
 * }
 *
 * For SKUs with multiple active counters (e.g. user bought both bundle and
 * scout separately), totals are summed. Remaining = total - used. period_end
 * is the LATEST expiry across counters (you have until then to use the rest).
 *
 * For unauthenticated users: returns 200 with all-zero state so the pricing
 * page can render without a redirect.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty = (sku: string) => ({
    sku,
    used: 0,
    total: 0,
    remaining: 0,
    period_end: null as string | null,
    has_quota: false,
  });

  const result = {
    scout: empty("scout"),
    forge: empty("forge"),
    prove: empty("prove"),
  };

  if (!user) return NextResponse.json(result);

  const { data: rows, error } = await supabase
    .from("usage_counters")
    .select("sku, used_count, quota_total, period_end")
    .eq("user_id", user.id)
    .gt("period_end", new Date().toISOString());

  if (error) {
    console.error("/api/quota query failed:", error.message);
    return NextResponse.json(result);
  }

  type Row = { sku: string; used_count: number; quota_total: number; period_end: string };
  for (const r of (rows ?? []) as Row[]) {
    const sku = r.sku as keyof typeof result;
    if (!result[sku]) continue;
    const slot = result[sku];
    slot.used += r.used_count;
    slot.total += r.quota_total;
    slot.has_quota = true;
    if (!slot.period_end || r.period_end > slot.period_end) {
      slot.period_end = r.period_end;
    }
  }
  for (const sku of ["scout", "forge", "prove"] as const) {
    result[sku].remaining = Math.max(0, result[sku].total - result[sku].used);
  }

  return NextResponse.json(result);
}
