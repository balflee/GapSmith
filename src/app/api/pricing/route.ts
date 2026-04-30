import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  BASE_PRICES,
  STEP_SIZE,
  calculateBondingPrice,
  calculateBundlePrice,
  getSlotsRemaining,
  getNextStepPrice,
} from "@/lib/bonding-curve";

export type PricingResponse = {
  prices: Record<
    string,
    {
      amount_cents: number;
      purchase_count: number;
      slots_remaining: number;
      next_step_price_cents: number;
      current_step: number;
      base_cents: number;
    }
  >;
};

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("purchase_counts")
      .select("sku, count");

    if (error) {
      console.error("Pricing query error:", error.message);
      return NextResponse.json({ error: "Failed to fetch pricing" }, { status: 500 });
    }

    const getCount = (sku: string) => {
      const row = data?.find((r: { sku: string; count: number }) => r.sku === sku);
      return row?.count ?? 0;
    };

    const prices: PricingResponse["prices"] = {};
    for (const sku of Object.keys(BASE_PRICES)) {
      const count = getCount(sku);
      const baseCents = BASE_PRICES[sku];

      if (sku === "bundle") {
        // Bundle = 80% of (scout + forge + prove) at current prices
        const bundlePrice = calculateBundlePrice(getCount("scout"), getCount("forge"), getCount("prove"));
        const nextBundlePrice = calculateBundlePrice(
          getCount("scout") + getSlotsRemaining(getCount("scout")),
          getCount("forge") + getSlotsRemaining(getCount("forge")),
          getCount("prove") + getSlotsRemaining(getCount("prove")),
        );
        prices[sku] = {
          amount_cents: bundlePrice,
          purchase_count: count,
          slots_remaining: Math.min(getSlotsRemaining(getCount("scout")), getSlotsRemaining(getCount("forge")), getSlotsRemaining(getCount("prove"))),
          next_step_price_cents: nextBundlePrice,
          current_step: Math.floor(count / STEP_SIZE),
          base_cents: bundlePrice,
        };
      } else {
        prices[sku] = {
          amount_cents: calculateBondingPrice(baseCents, count, sku),
          purchase_count: count,
          slots_remaining: getSlotsRemaining(count),
          next_step_price_cents: getNextStepPrice(baseCents, count, sku),
          current_step: Math.floor(count / STEP_SIZE),
          base_cents: baseCents,
        };
      }
    }

    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Pricing error:", error);
    return NextResponse.json({ error: "Failed to fetch pricing" }, { status: 500 });
  }
}
