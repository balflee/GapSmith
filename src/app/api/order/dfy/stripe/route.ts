import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { DFY_PRICING } from "../create/route";

const schema = z.object({ orderId: z.string().uuid() });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`dfy-stripe:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json();
    const { orderId } = schema.parse(body);

    const sb = createServiceRoleClient();
    const { data: order, error } = await sb
      .from("dfy_orders")
      .select("id, service, amount_cents, contact_email, payment_status")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.payment_status === "paid") {
      return NextResponse.json({ error: "Order already paid" }, { status: 409 });
    }

    const tier = DFY_PRICING[order.service as keyof typeof DFY_PRICING];
    if (!tier) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Done-For-You ${tier.label}`,
              description: `Premium ${order.service} pipeline run on top-tier LLM with human review.`,
            },
            unit_amount: order.amount_cents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "dfy_order",
        dfy_order_id: order.id,
        service: order.service,
      },
      // Use the email from the form so the receipt + Stripe dashboard match
      customer_email: order.contact_email,
      success_url: `${siteUrl}/order/success?id=${order.id}&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/order/${order.service}?cancelled=1`,
    });

    // Record the session id on the order so the webhook can resolve it later
    await sb
      .from("dfy_orders")
      .update({
        stripe_session_id: session.id,
        payment_method: "stripe",
      })
      .eq("id", order.id);

    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[DFY stripe] error:", e);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
