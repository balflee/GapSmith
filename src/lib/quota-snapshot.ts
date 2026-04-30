import type { SupabaseClient } from "@supabase/supabase-js";
import { quotaRowsForPurchase } from "@/lib/bonding-curve";

const PERIOD_DAYS = 365;
const PERIOD_MS = PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Snapshot the buyer's annual usage quota at purchase time.
 *
 * Both /api/checkout/x402/verify and /api/webhooks/stripe call this right
 * after they've inserted the purchases row. Bundle and CLI purchases create
 * 3 quota rows (scout/forge/prove) tied to the same purchase_id.
 *
 * Failures are logged but not raised — the purchase is already committed,
 * we don't want a quota-snapshot bug to block the checkout from completing.
 * Worst case: the user has zero quota and we surface that on first run.
 */
export async function snapshotPurchaseQuota(args: {
  supabase: SupabaseClient;
  userId: string;
  sku: string;
  purchaseId: string;
}): Promise<void> {
  const { supabase, userId, sku, purchaseId } = args;

  // Fetch current bonding-curve count for every SKU so bundle/CLI rows
  // can each snapshot their own SKU's quota tier.
  const { data: countsRows, error: countsErr } = await supabase
    .from("purchase_counts")
    .select("sku, count");

  if (countsErr) {
    console.error("snapshotPurchaseQuota: purchase_counts read failed:", countsErr.message);
    return;
  }

  const countBySku: Record<string, number> = {};
  for (const r of (countsRows ?? []) as { sku: string; count: number }[]) {
    countBySku[r.sku] = r.count;
  }

  const rows = quotaRowsForPurchase(sku, countBySku);
  if (rows.length === 0) {
    console.warn(`snapshotPurchaseQuota: no quota rows for sku=${sku}`);
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + PERIOD_MS);

  const { error: insertErr } = await supabase.from("usage_counters").insert(
    rows.map((r) => ({
      user_id: userId,
      sku: r.sku,
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      used_count: 0,
      quota_total: r.quota,
      purchase_id: purchaseId,
    })),
  );

  if (insertErr) {
    console.error(
      `snapshotPurchaseQuota: insert failed for purchase=${purchaseId} sku=${sku}:`,
      insertErr.message,
    );
  }
}
