/**
 * Bonding curve pricing for GapSmith SKUs.
 *
 * Formula: P(N) = P0 + (M * P0 - P0) * (1 - e^(-R * S)) + T * S
 *
 * Where:
 *   P0 = base price in cents
 *   M  = per-SKU multiplier (Scout 20x, Forge 25x, Prove 30x, CLI 35x)
 *   S  = floor(N / STEP_SIZE) — step number, price jumps every 10 purchases
 *   R  = DECAY_RATE (0.05)
 *   T  = TAIL_GROWTH_CENTS (25 cents = $0.25)
 *
 * Bundle = 80% of (Scout + Forge + Prove) at their current bonding curve prices.
 */

export const STEP_SIZE = 10;
export const DECAY_RATE = 0.05;
export const TAIL_GROWTH_CENTS = 25;

/** Per-SKU target multiplier — ceiling is M * P0 */
export const SKU_MULTIPLIERS: Record<string, number> = {
  scout: 20,
  forge: 25,
  prove: 30,
  cli: 35,
};

export const BASE_PRICES: Record<string, number> = {
  scout: 490,
  forge: 1290,
  prove: 1990,
  bundle: 0, // computed dynamically as 80% of scout+forge+prove
  cli: 3490,
};

/** Bundle is always 80% of the sum of scout+forge+prove at their current prices */
export const BUNDLE_DISCOUNT = 0.8;

/**
 * Round cents to the nearest .50 or .90 price point.
 * E.g., $7.23 → $6.90, $7.45 → $7.50, $7.72 → $7.90, $8.15 → $7.90
 * Snaps to whichever of .50 or .90 (of any dollar) is closest.
 */
export function roundToCharmPrice(cents: number): number {
  const dollars = Math.floor(cents / 100);
  const remainder = cents - dollars * 100;
  // Candidates: (dollars).50, (dollars).90, (dollars+1).50
  const candidates = [dollars * 100 + 50, dollars * 100 + 90, (dollars + 1) * 100 + 50];
  let best = candidates[0];
  let bestDist = Math.abs(cents - best);
  for (const c of candidates) {
    const dist = Math.abs(cents - c);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Calculate the price in cents at N total purchases sold.
 * Returns price rounded to nearest .50 or .90 charm price.
 * Base prices (step 0) are returned as-is (already charm-priced).
 */
export function calculateBondingPrice(
  baseCents: number,
  purchaseCount: number,
  sku?: string,
): number {
  const M = SKU_MULTIPLIERS[sku ?? ""] ?? 20;
  const S = Math.floor(purchaseCount / STEP_SIZE);
  if (S === 0) return baseCents;

  const curve =
    (M * baseCents - baseCents) *
    (1 - Math.exp(-DECAY_RATE * S));
  const tail = TAIL_GROWTH_CENTS * S;

  return roundToCharmPrice(Math.round(baseCents + curve + tail));
}

/**
 * Calculate bundle price as 80% of (scout + forge + prove) at their current prices.
 */
export function calculateBundlePrice(
  scoutCount: number,
  forgeCount: number,
  proveCount: number,
): number {
  const scoutPrice = calculateBondingPrice(BASE_PRICES.scout, scoutCount, "scout");
  const forgePrice = calculateBondingPrice(BASE_PRICES.forge, forgeCount, "forge");
  const provePrice = calculateBondingPrice(BASE_PRICES.prove, proveCount, "prove");
  return roundToCharmPrice(Math.round((scoutPrice + forgePrice + provePrice) * BUNDLE_DISCOUNT));
}

/**
 * How many slots remain at the current step price.
 */
export function getSlotsRemaining(purchaseCount: number): number {
  const remainder = purchaseCount % STEP_SIZE;
  return remainder === 0 ? STEP_SIZE : STEP_SIZE - remainder;
}

/**
 * Price at the next step boundary.
 */
export function getNextStepPrice(
  baseCents: number,
  purchaseCount: number,
  sku?: string,
): number {
  return calculateBondingPrice(
    baseCents,
    purchaseCount + getSlotsRemaining(purchaseCount),
    sku,
  );
}

/**
 * Annual usage quota baked into each lifetime SKU purchase.
 * Sub-linear growth vs price: quota goes up by 1 per step (price goes up ~12%/step).
 * That preserves the bonding curve story — early buyers still get the cheapest
 * per-run economics, later buyers pay more but get more total runs as a partial
 * offset.
 *
 * Bundle and CLI are handled separately (see quotaRowsForPurchase).
 */
export const BASE_QUOTAS: Record<string, number> = {
  scout: 12,    // 12 runs/year @ step 0
  forge: 6,     // 6 sessions/year @ step 0
  prove: 4,     // 4 debates/year @ step 0
};

/** CLI ships with all 3 tools, each at 2× the base SKU's quota — premium tier. */
const CLI_QUOTA_MULTIPLIER = 2;

/**
 * Annual quota for a single-SKU purchase at the given purchase count.
 * Caller must NOT pass "bundle" or "cli" — use quotaRowsForPurchase() for those.
 */
export function calculateQuota(sku: string, purchaseCount: number): number {
  const base = BASE_QUOTAS[sku];
  if (base === undefined) return 0;
  const step = Math.floor(purchaseCount / STEP_SIZE);
  return base + step;
}

/**
 * Translate a purchase into one or more usage_counters rows.
 *
 *   - Single SKU (scout/forge/prove): 1 row.
 *   - Bundle: 3 rows (scout+forge+prove), each at its own bonding-curve quota.
 *   - CLI: 3 rows, each at 2× the corresponding SKU's quota.
 *
 * @param sku           The SKU just purchased
 * @param countBySku    Current purchase_counts.count per SKU (used to snapshot quota)
 */
export function quotaRowsForPurchase(
  sku: string,
  countBySku: Record<string, number>,
): Array<{ sku: string; quota: number }> {
  const c = (s: string) => countBySku[s] ?? 0;
  if (sku === "bundle") {
    return [
      { sku: "scout", quota: calculateQuota("scout", c("scout")) },
      { sku: "forge", quota: calculateQuota("forge", c("forge")) },
      { sku: "prove", quota: calculateQuota("prove", c("prove")) },
    ];
  }
  if (sku === "cli") {
    return [
      { sku: "scout", quota: calculateQuota("scout", c("scout")) * CLI_QUOTA_MULTIPLIER },
      { sku: "forge", quota: calculateQuota("forge", c("forge")) * CLI_QUOTA_MULTIPLIER },
      { sku: "prove", quota: calculateQuota("prove", c("prove")) * CLI_QUOTA_MULTIPLIER },
    ];
  }
  // Direct SKU
  return [{ sku, quota: calculateQuota(sku, c(sku)) }];
}

/**
 * Generate curve points for SVG visualization.
 * Each point represents the price at step S (i.e., after S * STEP_SIZE purchases).
 */
export function generateCurvePoints(
  baseCents: number,
  maxSteps: number = 200,
  sku?: string,
): Array<{ step: number; price: number }> {
  const points: Array<{ step: number; price: number }> = [];
  for (let s = 0; s < maxSteps; s++) {
    points.push({
      step: s,
      price: calculateBondingPrice(baseCents, s * STEP_SIZE, sku),
    });
  }
  return points;
}
