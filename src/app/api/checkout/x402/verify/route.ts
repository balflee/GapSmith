import { NextResponse } from "next/server";
import { z } from "zod";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { trackServerEvent } from "@/lib/analytics-server";
import { snapshotPurchaseQuota } from "@/lib/quota-snapshot";
import {
  verifyPayment,
  verifyUsdcPayment,
  getUsdcMint,
  type SolanaNetwork,
} from "@/lib/x402";

const PAYMENT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

const verifySchema = z.object({
  paymentId: z.string().max(200),
  txSignature: z.string().max(200),
});

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

  try {
    const body = await request.json();
    const { paymentId, txSignature } = verifySchema.parse(body);

    const serviceClient = createServiceRoleClient();

    // 1. Idempotency: reject if this tx has already been credited
    const { data: existingPurchase } = await serviceClient
      .from("purchases")
      .select("id")
      .eq("tx_hash", txSignature)
      .limit(1)
      .maybeSingle();
    if (existingPurchase) {
      return NextResponse.json(
        { verified: false, error: "Transaction already credited" },
        { status: 409 }
      );
    }

    // 2. Look up pending payment
    const { data: payment, error: lookupError } = await serviceClient
      .from("x402_pending_payments")
      .select()
      .eq("id", paymentId)
      .single();

    if (lookupError || !payment) {
      return NextResponse.json(
        { verified: false, error: "Payment not found" },
        { status: 404 }
      );
    }

    if (payment.user_id !== user.id) {
      return NextResponse.json(
        { verified: false, error: "Payment does not belong to this user" },
        { status: 403 }
      );
    }

    if (payment.status === "verified") {
      return NextResponse.json(
        { verified: false, error: "Payment already verified" },
        { status: 409 }
      );
    }

    const createdAt = new Date(payment.created_at).getTime();
    if (Date.now() - createdAt > PAYMENT_EXPIRY_MS) {
      return NextResponse.json(
        { verified: false, error: "Payment expired" },
        { status: 410 }
      );
    }

    const network = (payment.network ?? "mainnet") as SolanaNetwork;
    const paymentToken = (payment.payment_token ?? "sol") as "sol" | "usdc";

    // 3. Verify on-chain — dispatch on payment_token
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
      // Legacy SOL path
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

    // 4. Mark pending verified, insert purchase, atomically bump counter
    await serviceClient
      .from("x402_pending_payments")
      .update({ status: "verified", tx_hash: txSignature })
      .eq("id", paymentId);

    const { data: insertedPurchase, error: insertErr } = await serviceClient
      .from("purchases")
      .insert({
        user_id: user.id,
        sku: payment.sku,
        amount_cents: payment.amount_usd_cents,
        payment_method: paymentToken === "usdc" ? "x402_usdc" : "x402_sol",
        tx_hash: txSignature,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Failed to insert purchase:", insertErr.message);
    }

    // Atomic increment via RPC (replaces previous read-modify-write race)
    const { error: rpcError } = await serviceClient.rpc("increment_purchase_count", {
      sku_input: payment.sku,
    });
    if (rpcError) {
      console.error("increment_purchase_count failed:", rpcError.message);
      // Non-fatal — purchase is already recorded; UI will resync on next /api/pricing call
    }

    // Snapshot annual usage quota tied to this purchase.
    // Bundle/CLI create 3 quota rows; scout/forge/prove create 1.
    if (insertedPurchase?.id) {
      await snapshotPurchaseQuota({
        supabase: serviceClient,
        userId: user.id,
        sku: payment.sku,
        purchaseId: insertedPurchase.id,
      });
    }

    await trackServerEvent("x402_pay_success", user.id, {
      plan: payment.sku,
      amount_cents: payment.amount_usd_cents,
      payment_token: paymentToken,
      network,
      tx_hash: txSignature,
      provider: "x402",
    });

    return NextResponse.json({ verified: true, sku: payment.sku });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("x402 verify error:", error);
    return NextResponse.json(
      { verified: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}
