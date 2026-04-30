import { NextResponse } from "next/server";
import { z } from "zod";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import {
  BASE_PRICES,
  calculateBondingPrice,
  calculateBundlePrice,
} from "@/lib/bonding-curve";
import {
  getMerchantWallet,
  getNetwork,
  getUsdcMint,
  USDC_DECIMALS,
  usdCentsToSol,
  usdCentsToUsdcAtomic,
  formatUsdcAtomic,
} from "@/lib/x402";

const x402Schema = z.object({
  plan: z.enum(["scout", "forge", "prove", "bundle", "cli"]),
  token: z.enum(["sol", "usdc"]).optional().default("usdc"),
});

/**
 * Compute the current bonding curve price for a SKU using purchase_counts.
 * Mirrors logic in /api/pricing/route.ts so checkout always agrees with the page.
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(ip, { limit: 10, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let merchantWallet: string;
  try {
    merchantWallet = getMerchantWallet();
  } catch {
    return NextResponse.json({ error: "x402 payments not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { plan, token } = x402Schema.parse(body);

    const amountUsdCents = await snapPrice(supabase, plan);
    if (amountUsdCents === null) {
      return NextResponse.json({ error: "Invalid SKU" }, { status: 400 });
    }

    const network = getNetwork();
    const amountSol = usdCentsToSol(amountUsdCents);
    const amountUsdcAtomic = usdCentsToUsdcAtomic(amountUsdCents);

    // Use service-role client for the write — RLS on x402_pending_payments only
    // allows the service_role to INSERT (matches /api/checkout/x402/verify pattern).
    const serviceClient = createServiceRoleClient();
    const { data: payment, error: insertError } = await serviceClient
      .from("x402_pending_payments")
      .insert({
        user_id: user.id,
        sku: plan,
        amount_sol: amountSol,
        amount_usd_cents: amountUsdCents,
        amount_usdc_atomic: token === "usdc" ? amountUsdcAtomic.toString() : null,
        payment_token: token,
        network,
        merchant_wallet: merchantWallet,
        memo: "", // set after we get the row ID
        status: "pending",
      })
      .select()
      .single();

    if (insertError || !payment) {
      console.error("Failed to create x402 pending payment:", insertError?.message);
      return NextResponse.json({ error: "Payment creation failed" }, { status: 500 });
    }

    const paymentId = payment.id;
    const memo = `gapsmith:${user.id}:${plan}:${paymentId}`;

    await serviceClient.from("x402_pending_payments").update({ memo }).eq("id", paymentId);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // For USDC, also surface the merchant's Associated Token Account so the
    // client can transfer directly without re-deriving on every request.
    let merchantUsdcAta: string | null = null;
    let usdcMint: string | null = null;
    if (token === "usdc") {
      usdcMint = getUsdcMint(network);
      merchantUsdcAta = (
        await getAssociatedTokenAddress(new PublicKey(usdcMint), new PublicKey(merchantWallet))
      ).toBase58();
    }

    return NextResponse.json({
      paymentId,
      sku: plan,
      paymentToken: token,
      network,
      merchantWallet,
      memo,
      expiresAt,
      // USD reference (always present)
      amountUsdCents,
      // SOL fields (always present, used only when token=sol)
      amountSol,
      // USDC fields (present when token=usdc)
      amountUsdc: token === "usdc" ? formatUsdcAtomic(amountUsdcAtomic) : null,
      amountUsdcAtomic: token === "usdc" ? amountUsdcAtomic.toString() : null,
      usdcMint,
      merchantUsdcAta,
      decimals: token === "usdc" ? USDC_DECIMALS : 9,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("x402 checkout error:", error);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
