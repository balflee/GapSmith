import { NextResponse } from "next/server";
import { z } from "zod";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { trackServerEvent } from "@/lib/analytics-server";
import {
  verifyPayment,
  verifyUsdcPayment,
  getUsdcMint,
  type SolanaNetwork,
} from "@/lib/x402";
import { sendDfyOrderConfirmation, sendDfyOrderNotification } from "@/lib/dfy-notify";

const PAYMENT_EXPIRY_MS = 15 * 60 * 1000;

const schema = z.object({
  paymentId: z.string().max(200),
  txSignature: z.string().max(200),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`dfy-verify:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json();
    const { paymentId, txSignature } = schema.parse(body);

    const sb = createServiceRoleClient();

    // Idempotency: tx already credited to a DFY order?
    const { data: existing } = await sb
      .from("dfy_orders")
      .select("id")
      .eq("x402_tx_hash", txSignature)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { verified: false, error: "Transaction already credited" },
        { status: 409 }
      );
    }

    const { data: payment, error: lookupError } = await sb
      .from("x402_pending_payments")
      .select()
      .eq("id", paymentId)
      .single();

    if (lookupError || !payment) {
      return NextResponse.json({ verified: false, error: "Payment not found" }, { status: 404 });
    }
    if (!String(payment.sku).startsWith("dfy_")) {
      return NextResponse.json(
        { verified: false, error: "Payment is not a DFY order — use the regular verify route" },
        { status: 400 }
      );
    }
    if (payment.status === "verified") {
      return NextResponse.json(
        { verified: false, error: "Payment already verified" },
        { status: 409 }
      );
    }
    if (Date.now() - new Date(payment.created_at).getTime() > PAYMENT_EXPIRY_MS) {
      return NextResponse.json({ verified: false, error: "Payment expired" }, { status: 410 });
    }

    const network = (payment.network ?? "mainnet") as SolanaNetwork;
    const paymentToken = (payment.payment_token ?? "usdc") as "sol" | "usdc";

    if (paymentToken === "usdc") {
      const expectedAtomic = BigInt(payment.amount_usdc_atomic ?? "0");
      if (expectedAtomic <= BigInt(0)) {
        return NextResponse.json(
          { verified: false, error: "Pending payment missing USDC amount" },
          { status: 500 }
        );
      }
      const expectedMint = getUsdcMint(network);
      const merchantUsdcAta = (
        await getAssociatedTokenAddress(
          new PublicKey(expectedMint),
          new PublicKey(payment.merchant_wallet)
        )
      ).toBase58();

      const result = await verifyUsdcPayment({
        txSignature,
        expectedAtomic,
        merchantUsdcAta,
        expectedMint,
        expectedMemo: payment.memo,
        network,
      });
      if (!result.verified) {
        return NextResponse.json(
          { verified: false, error: result.error ?? "USDC verification failed" },
          { status: 400 }
        );
      }
    } else {
      const result = await verifyPayment(
        payment.id,
        txSignature,
        Number(payment.amount_sol),
        payment.merchant_wallet,
        network
      );
      if (!result.verified) {
        return NextResponse.json(
          { verified: false, error: result.error ?? "SOL verification failed" },
          { status: 400 }
        );
      }
    }

    await sb
      .from("x402_pending_payments")
      .update({ status: "verified", tx_hash: txSignature })
      .eq("id", paymentId);

    // Resolve the DFY order via the back-pointer we set in the create route.
    const { data: order, error: orderErr } = await sb
      .from("dfy_orders")
      .select("*")
      .eq("x402_pending_payment_id", paymentId)
      .single();

    if (orderErr || !order) {
      console.error("[DFY verify] cannot find order for payment:", paymentId, orderErr?.message);
      return NextResponse.json(
        { verified: true, warning: "Payment verified but order link missing — contact support" },
        { status: 200 }
      );
    }

    await sb
      .from("dfy_orders")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        x402_tx_hash: txSignature,
        status: "in_queue",
      })
      .eq("id", order.id);

    // Fire-and-forget emails — never block the verify response on delivery.
    const paidOrder = { ...order, payment_status: "paid", x402_tx_hash: txSignature };
    sendDfyOrderNotification(paidOrder).catch((e) =>
      console.error("[DFY verify] notify failed:", e?.message)
    );
    sendDfyOrderConfirmation(paidOrder).catch((e) =>
      console.error("[DFY verify] confirm failed:", e?.message)
    );

    if (order.user_id) {
      await trackServerEvent("dfy_paid", order.user_id, {
        service: order.service,
        amount_cents: order.amount_cents,
        payment_method: "usdc",
        tx_hash: txSignature,
      });
    }

    return NextResponse.json({ verified: true, orderId: order.id, service: order.service });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[DFY verify] error:", e);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
