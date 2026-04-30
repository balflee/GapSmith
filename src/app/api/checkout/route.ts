import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import {
  BASE_PRICES,
  calculateBondingPrice,
  calculateBundlePrice,
} from "@/lib/bonding-curve";

export const checkoutSchema = z.object({
  plan: z.enum(["scout", "forge", "prove", "bundle", "cli"]),
});

export type CheckoutResponse = { url: string | null };

const PLAN_NAMES: Record<string, string> = {
  scout: "GapSmith Scout (lifetime)",
  forge: "GapSmith Forge (lifetime)",
  prove: "GapSmith Prove (lifetime)",
  bundle: "GapSmith Bundle — Scout + Forge + Prove (lifetime)",
  cli: "GapSmith CLI — all three tools (lifetime)",
};

/**
 * Snap the current bonding curve price for the requested SKU using purchase_counts.
 * Mirrors the logic in /api/pricing/route.ts and /api/checkout/x402/route.ts so
 * the Stripe checkout always agrees with what the page displayed.
 */
async function snapPrice(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sku: string
): Promise<number | null> {
  const { data, error } = await supabase.from("purchase_counts").select("sku, count");
  if (error) return null;
  const getCount = (s: string) =>
    data?.find((r: { sku: string; count: number }) => r.sku === s)?.count ?? 0;

  if (sku === "bundle") {
    return calculateBundlePrice(getCount("scout"), getCount("forge"), getCount("prove"));
  }
  const baseCents = BASE_PRICES[sku];
  if (baseCents === undefined) return null;
  return calculateBondingPrice(baseCents, getCount(sku), sku);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(ip, { limit: 10, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  // TODO: Upgrade to Upstash Redis for cross-instance rate limiting

  try {
    const body = await request.json();
    const { plan } = checkoutSchema.parse(body);

    const amount_cents = await snapPrice(supabase, plan);
    if (amount_cents === null) {
      return NextResponse.json({ error: "Invalid SKU" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    // Where to land after success: the unlocked product page (or /pricing for bundle/cli)
    const successPath =
      plan === "scout" || plan === "forge" || plan === "prove"
        ? `/${plan}`
        : `/pricing?paid=${plan}`;

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: PLAN_NAMES[plan] ?? plan },
            unit_amount: amount_cents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        plan,
        amount_cents: String(amount_cents),
      },
      success_url: `${siteUrl}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pricing?cancelled=1`,
      // Surface the user's email on the receipt + Stripe dashboard
      customer_email: user.email,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
