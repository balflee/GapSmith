/**
 * On-chain traction aggregator for the homepage strip.
 *
 * Honesty-first: only counts mainnet activity. Devnet test calls are
 * excluded — judges who click through to Solscan need to see numbers
 * that match what's actually on the merchant wallet's tx history.
 *
 * Sources:
 * - `purchases` where payment_method='x402_usdc' (human Phantom flows)
 * - `agent_jobs` where status='completed' AND network='mainnet'
 *
 * Stripe purchases are deliberately omitted — the strip's job is to
 * tell the Solana / x402 story, not the Stripe one. Stripe revenue
 * still exists, just not on this surface.
 */

import { createServiceRoleClient } from "@/lib/supabase-server";

export const MERCHANT_WALLET = "BuBjMDp2B9dPxFHjWU4qWZBQKKWkAXoiPts2GWGN9Rbv";
export const SOLSCAN_URL = `https://solscan.io/account/${MERCHANT_WALLET}`;

export interface TractionData {
  /** Total mainnet sessions (humans buying via Phantom + agents paying via x402). */
  mainnetSessions: number;
  /** Total USDC settled on-chain, in dollars (e.g. 10.20 = $10.20). */
  usdcSettled: number;
  /** Count of mainnet agent API calls that completed successfully (subset of mainnetSessions). */
  agentApiCalls: number;
  /** Solscan URL for the merchant wallet — judges click here to verify. */
  walletUrl: string;
  /** ISO date string of the last on-chain settlement we observed. Helps "still live" signal. */
  lastActivityAt: string | null;
}

/** Default returned when DB is unreachable (build/prerender). Never fakes numbers — shows zeros + the wallet link. */
const EMPTY_TRACTION: TractionData = {
  mainnetSessions: 0,
  usdcSettled: 0,
  agentApiCalls: 0,
  walletUrl: SOLSCAN_URL,
  lastActivityAt: null,
};

export async function fetchTraction(): Promise<TractionData> {
  try {
    const sb = createServiceRoleClient();

    const [purchaseRes, mainnetJobsRes] = await Promise.all([
      sb.from("purchases")
        .select("amount_cents, created_at")
        .eq("payment_method", "x402_usdc"),
      sb.from("agent_jobs")
        .select("amount_usdc_atomic, completed_at")
        .eq("status", "completed")
        .eq("network", "mainnet"),
    ]);

    type PurchaseRow = { amount_cents: number | null; created_at: string };
    type JobRow = { amount_usdc_atomic: number | string | null; completed_at: string | null };
    const purchases = (purchaseRes.data ?? []) as PurchaseRow[];
    const mainnetJobs = (mainnetJobsRes.data ?? []) as JobRow[];

    const purchasesUsd = purchases.reduce((s: number, r: PurchaseRow) => s + (r.amount_cents ?? 0), 0) / 100;
    // amount_usdc_atomic is bigint-as-number — Supabase returns it as a string for large
    // values, but our values are small (<=$25 = 25_000_000 atomic, well within Number precision).
    // Cast through Number to handle either string or number.
    const jobsUsd = mainnetJobs.reduce((s: number, r: JobRow) => s + Number(r.amount_usdc_atomic ?? 0), 0) / 1_000_000;

    // Latest activity timestamp across both sources (purchases.created_at since
    // there is no completed_at on x402 purchases — the row only exists on
    // successful settlement).
    const allDates = [
      ...purchases.map((r: PurchaseRow) => r.created_at).filter(Boolean),
      ...mainnetJobs.map((r: JobRow) => r.completed_at).filter((d): d is string => !!d),
    ];
    const lastActivityAt = allDates.length
      ? allDates.reduce((latest, cur) => (cur > latest ? cur : latest))
      : null;

    return {
      mainnetSessions: purchases.length + mainnetJobs.length,
      usdcSettled: Math.round((purchasesUsd + jobsUsd) * 100) / 100, // 2 decimals
      agentApiCalls: mainnetJobs.length,
      walletUrl: SOLSCAN_URL,
      lastActivityAt,
    };
  } catch (e) {
    // Don't block the page render on DB hiccups — empty traction strip
    // still shows the wallet link, reads as "early stage" not "broken".
    console.error("[traction] fetch failed:", (e as Error).message);
    return EMPTY_TRACTION;
  }
}
