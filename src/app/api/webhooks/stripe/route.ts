import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { trackServerEvent } from "@/lib/analytics-server";
import { rateLimit } from "@/lib/rate-limit";
import { snapshotPurchaseQuota } from "@/lib/quota-snapshot";
import { sendDfyOrderConfirmation, sendDfyOrderNotification } from "@/lib/dfy-notify";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(ip, { limit: 30, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // ───────────────── Done-For-You order branch ─────────────────
    // DFY checkouts carry metadata.kind = "dfy_order" and dfy_order_id.
    // They're independent of the lifetime SKU purchase flow below.
    if (session.metadata?.kind === "dfy_order") {
      const orderId = session.metadata.dfy_order_id;
      if (!orderId) {
        console.error("DFY webhook missing dfy_order_id:", session.id);
        return NextResponse.json({ received: true });
      }
      const sb = createServiceRoleClient();

      // Idempotency: Stripe retries — bail if already paid.
      const { data: existing } = await sb
        .from("dfy_orders")
        .select("id, payment_status")
        .eq("id", orderId)
        .maybeSingle();
      if (!existing) {
        console.error("DFY webhook: order not found", orderId);
        return NextResponse.json({ received: true });
      }
      if (existing.payment_status === "paid") {
        return NextResponse.json({ received: true, status: "already_paid" });
      }

      const { data: updatedOrder, error: updateError } = await sb
        .from("dfy_orders")
        .update({
          payment_status: "paid",
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
          payment_method: "stripe",
          status: "in_queue",
        })
        .eq("id", orderId)
        .select("*")
        .single();

      if (updateError) {
        console.error("DFY webhook: order update failed:", updateError.message);
      } else if (updatedOrder) {
        sendDfyOrderNotification(updatedOrder).catch((e) =>
          console.error("DFY webhook: notify failed:", e?.message)
        );
        sendDfyOrderConfirmation(updatedOrder).catch((e) =>
          console.error("DFY webhook: confirm failed:", e?.message)
        );
        if (updatedOrder.user_id) {
          await trackServerEvent("dfy_paid", updatedOrder.user_id, {
            service: updatedOrder.service,
            amount_cents: updatedOrder.amount_cents,
            payment_method: "stripe",
            stripe_session_id: session.id,
          });
        }
      }
      return NextResponse.json({ received: true, kind: "dfy_order" });
    }
    // ─────────── Regular lifetime SKU purchase branch ───────────

    const userId = session.metadata?.user_id ?? "unknown";
    const plan = session.metadata?.plan ?? "";
    const amountCents = Number(session.metadata?.amount_cents ?? 0);

    if (!userId || userId === "unknown" || !plan) {
      console.error("Stripe webhook missing metadata:", { userId, plan, sessionId: session.id });
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceRoleClient();

    // Idempotency: Stripe retries webhooks; reject if this session already recorded.
    const { data: existing } = await supabase
      .from("purchases")
      .select("id")
      .eq("stripe_session_id", session.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Already recorded, ack and skip
      return NextResponse.json({ received: true, status: "already_recorded" });
    }

    const { data: insertedPurchase, error: purchaseError } = await supabase
      .from("purchases")
      .insert({
        user_id: userId,
        sku: plan,
        amount_cents: amountCents,
        payment_method: "stripe",
        stripe_session_id: session.id,
      })
      .select("id")
      .single();

    if (purchaseError) {
      console.error("Failed to record purchase:", purchaseError.message);
      // Don't 500 — Stripe will retry indefinitely. Surface but ack.
    } else {
      // Atomically increment via RPC (race-free; replaces previous read-modify-write)
      const { error: rpcError } = await supabase.rpc("increment_purchase_count", {
        sku_input: plan,
      });
      if (rpcError) {
        console.error("increment_purchase_count failed for stripe webhook:", rpcError.message);
      }

      // Snapshot annual usage quota tied to this purchase.
      if (insertedPurchase?.id) {
        await snapshotPurchaseQuota({
          supabase,
          userId,
          sku: plan,
          purchaseId: insertedPurchase.id,
        });
      }

      await trackServerEvent("pay_success", userId, {
        plan,
        amount_cents: amountCents,
        provider: "stripe",
      });
    }
  }

  return NextResponse.json({ received: true });
}
