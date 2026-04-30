import type { SupabaseClient } from "@supabase/supabase-js";

export type Sku = "scout" | "forge" | "prove" | "bundle" | "cli";
export const PRODUCT_SKUS: Sku[] = ["scout", "forge", "prove", "bundle", "cli"];

/**
 * Returns the set of SKU rows that grant access to the requested SKU.
 * - bundle grants scout / forge / prove (and itself)
 * - cli grants scout / forge / prove (and itself) — CLI ships with all three tools per pricing page
 * - cli requires owning cli specifically (bundle does NOT grant cli, since cli is more expensive)
 * - bundle requires owning bundle specifically (cli does NOT grant bundle either way)
 */
function grantingSkus(sku: Sku): Sku[] {
  if (sku === "scout" || sku === "forge" || sku === "prove") {
    return [sku, "bundle", "cli"];
  }
  return [sku]; // bundle/cli granted only by direct purchase
}

/**
 * Check whether a user owns access to a SKU, accounting for bundle/CLI sub-grants.
 * Returns false on any DB error (fail closed).
 */
export async function userOwnsSku(
  supabase: SupabaseClient,
  userId: string,
  sku: Sku
): Promise<boolean> {
  const { data, error } = await supabase
    .from("purchases")
    .select("id")
    .eq("user_id", userId)
    .in("sku", grantingSkus(sku))
    .limit(1);
  if (error) {
    console.error("userOwnsSku query failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Bulk version: returns ownership for every SKU in a single query.
 * Used by /api/access/check to populate the pricing page UI.
 */
export async function userOwnedSkuMap(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<Sku, boolean>> {
  const owned: Record<Sku, boolean> = {
    scout: false,
    forge: false,
    prove: false,
    bundle: false,
    cli: false,
  };
  const { data, error } = await supabase
    .from("purchases")
    .select("sku")
    .eq("user_id", userId);
  if (error) {
    console.error("userOwnedSkuMap query failed:", error.message);
    return owned;
  }
  const rows = (data ?? []) as { sku: string }[];
  const has = (s: string) => rows.some((r) => r.sku === s);
  // direct ownership
  for (const sku of PRODUCT_SKUS) owned[sku] = has(sku);
  // sub-grants: bundle or cli unlocks scout/forge/prove
  if (has("bundle") || has("cli")) {
    owned.scout = true;
    owned.forge = true;
    owned.prove = true;
  }
  return owned;
}
