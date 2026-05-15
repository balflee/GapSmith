/**
 * Trial-mode helpers for /free-trial signup users.
 *
 * A user is "trial-only" when every row in their `purchases` table has
 * payment_method='trial' (granted automatically on email verification by
 * the trigger in migration 019). Such users:
 *   - Pass userOwnsSku() because they DO own a (synthetic) purchase row.
 *   - Pass consume_quota() once per pipeline (quota_total=1).
 *   - Don't have an `api_keys` row, so the existing BYOK path can't run
 *     for them — we route them to the company's MiniMax key instead.
 *
 * If a trial user later pays for a real tier, they get a non-trial
 * purchase row → isTrialOnly() returns false → BYOK path resumes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Server env: company-funded MiniMax key for free-trial runs.
 *  Routes return 503 cleanly when this isn't set, so the trial
 *  flow stays disabled in environments that haven't configured it. */
export const TRIAL_PROVIDER = "minimax";
export const TRIAL_MODEL = "MiniMax-M2.7";

export type TrialKeyset = {
  apiKey: string;
  provider: string;
  model: string;
};

/**
 * Returns true iff every purchase the user has is a trial entitlement.
 * False when the user has at least one paid purchase, or zero purchases
 * at all (the latter shouldn't reach this code path — userOwnsSku would
 * have already 403'd them — but we return false defensively).
 */
export async function isTrialOnly(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("purchases")
    .select("payment_method")
    .eq("user_id", userId);
  if (error || !data || data.length === 0) return false;
  return data.every((p) => p.payment_method === "trial");
}

/**
 * Returns the server-side trial keyset, or null if MINIMAX_TRIAL_KEY
 * isn't configured. Caller should 503 on null so the user sees a clear
 * "Trial mode not configured" error instead of an opaque engine 500.
 */
export function getTrialKeyset(): TrialKeyset | null {
  const apiKey = process.env.MINIMAX_TRIAL_KEY;
  if (!apiKey) return null;
  return { apiKey, provider: TRIAL_PROVIDER, model: TRIAL_MODEL };
}
