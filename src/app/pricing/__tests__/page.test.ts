import { describe, it, expect } from "vitest";

/**
 * Pricing page tests -- verify the module exports a default component
 * and that the SKU data constants are correctly structured.
 * Updated for bonding-curve dynamic pricing rewrite.
 */

describe("Pricing page module", () => {
  it("exports a default React component", async () => {
    const mod = await import("../page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("exports SKU_DATA with all 5 SKUs", async () => {
    const mod = await import("../page");
    expect(mod.SKU_DATA).toBeDefined();
    expect(mod.SKU_DATA).toHaveLength(5);
    const skuIds = mod.SKU_DATA.map((s: { id: string }) => s.id);
    expect(skuIds).toContain("scout");
    expect(skuIds).toContain("forge");
    expect(skuIds).toContain("prove");
    expect(skuIds).toContain("bundle");
    expect(skuIds).toContain("cli");
  });

  it("each SKU has required fields including color and description", async () => {
    const mod = await import("../page");
    for (const sku of mod.SKU_DATA) {
      expect(sku).toHaveProperty("id");
      expect(sku).toHaveProperty("name");
      expect(sku).toHaveProperty("baseCents");
      expect(sku).toHaveProperty("features");
      expect(sku).toHaveProperty("color");
      expect(sku).toHaveProperty("description");
      expect(typeof sku.baseCents).toBe("number");
      expect(Array.isArray(sku.features)).toBe(true);
      expect(sku.features.length).toBeGreaterThan(0);
    }
  });

  it("bundle base price is less than sum of individual tools", async () => {
    const mod = await import("../page");
    const scout = mod.SKU_DATA.find((s: { id: string }) => s.id === "scout");
    const forge = mod.SKU_DATA.find((s: { id: string }) => s.id === "forge");
    const prove = mod.SKU_DATA.find((s: { id: string }) => s.id === "prove");
    const bundle = mod.SKU_DATA.find((s: { id: string }) => s.id === "bundle");
    const sumIndividual = scout!.baseCents + forge!.baseCents + prove!.baseCents;
    expect(bundle!.baseCents).toBeLessThan(sumIndividual);
  });

  it("SKU baseCents match bonding-curve BASE_PRICES", async () => {
    const { SKU_DATA } = await import("../page");
    const { BASE_PRICES } = await import("@/lib/bonding-curve");
    for (const sku of SKU_DATA) {
      expect(sku.baseCents).toBe(BASE_PRICES[sku.id]);
    }
  });

  it("exports FAQ_DATA with at least 4 entries including bonding curve explanation", async () => {
    const mod = await import("../page");
    expect(mod.FAQ_DATA).toBeDefined();
    expect(mod.FAQ_DATA.length).toBeGreaterThanOrEqual(4);
    // At least one FAQ should mention bonding curve or dynamic pricing
    const hasDynamicPricingFaq = mod.FAQ_DATA.some(
      (f: { q: string; a: string }) =>
        f.q.toLowerCase().includes("price") ||
        f.a.toLowerCase().includes("bonding") ||
        f.a.toLowerCase().includes("dynamic")
    );
    expect(hasDynamicPricingFaq).toBe(true);
  });

  it("exports CURVE_SKUS with scout, forge, prove for the bonding curve tabs", async () => {
    const mod = await import("../page");
    expect(mod.CURVE_SKUS).toBeDefined();
    expect(mod.CURVE_SKUS).toHaveLength(3);
    const ids = mod.CURVE_SKUS.map((s: { id: string }) => s.id);
    expect(ids).toEqual(["scout", "forge", "prove"]);
  });
});
