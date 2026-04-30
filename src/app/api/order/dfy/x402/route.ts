import { NextResponse } from "next/server";
import { z } from "zod";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import {
  getMerchantWallet,
  getNetwork,
  getUsdcMint,
  USDC_DECIMALS,
  usdCentsToSol,
  usdCentsToUsdcAtomic,
  formatUsdcAtomic,
} from "@/lib/x402";

const schema = z.object({
  orderId: z.string().uuid(),
  token: z.enum(["usdc", "sol"]).optional().default("usdc"),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`dfy-x402:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let merchantWallet: string;
  try {
    merchantWallet = getMerchantWallet();
  } catch {
    return NextResponse.json({ error: "x402 payments not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { orderId, token } = schema.parse(body);

    const sb = createServiceRoleClient();
    const { data: order, error } = await sb
      .from("dfy_orders")
      .select("id, service, amount_cents, payment_status")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.payment_status === "paid") {
      return NextResponse.json({ error: "Order already paid" }, { status: 409 });
    }

    const amountCents = order.amount_cents;
    const network = getNetwork();
    const amountSol = usdCentsToSol(amountCents);
    const amountUsdcAtomic = usdCentsToUsdcAtomic(amountCents);

    // Reuse x402_pending_payments. user_id NULL is fine here (RLS bypassed by service role).
    // sku tagged "dfy_<service>" so the row never collides with regular purchases.
    const { data: payment, error: insertError } = await sb
      .from("x402_pending_payments")
      .insert({
        user_id: null,  // anon DFY orders allowed
        sku: `dfy_${order.service}`,
        amount_sol: amountSol,
        amount_usd_cents: amountCents,
        amount_usdc_atomic: token === "usdc" ? amountUsdcAtomic.toString() : null,
        payment_token: token,
        network,
        merchant_wallet: merchantWallet,
        memo: "",
        status: "pending",
      })
      .select()
      .single();

    if (insertError || !payment) {
      console.error("[DFY x402] insert failed:", insertError?.message);
      return NextResponse.json({ error: "Payment creation failed" }, { status: 500 });
    }

    const paymentId = payment.id;
    const memo = `gapsmith-dfy:${order.service}:${order.id}:${paymentId}`;

    await sb.from("x402_pending_payments").update({ memo }).eq("id", paymentId);
    await sb
      .from("dfy_orders")
      .update({ payment_method: "usdc", x402_pending_payment_id: paymentId })
      .eq("id", order.id);

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
      orderId: order.id,
      paymentToken: token,
      network,
      merchantWallet,
      memo,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      amountUsdCents: amountCents,
      amountSol,
      amountUsdc: token === "usdc" ? formatUsdcAtomic(amountUsdcAtomic) : null,
      amountUsdcAtomic: token === "usdc" ? amountUsdcAtomic.toString() : null,
      usdcMint,
      merchantUsdcAta,
      decimals: token === "usdc" ? USDC_DECIMALS : 9,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[DFY x402] error:", e);
    return NextResponse.json({ error: "Payment creation failed" }, { status: 500 });
  }
}
