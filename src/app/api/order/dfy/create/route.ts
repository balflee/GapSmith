import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";

/** Premium Done-For-You service tiers — fixed price, not bonding-curve. */
export const DFY_PRICING = {
  scout: { amountCents: 3900, label: "Scout Run" },
  forge: { amountCents: 9900, label: "Forge Run" },
  prove: { amountCents: 14900, label: "Prove Run" },
} as const;

const createSchema = z.object({
  service: z.enum(["scout", "forge", "prove"]),
  contact_email: z.string().email().max(254),
  contact_name: z.string().max(120).optional(),
  brief_sectors: z.string().max(2000).optional(),
  brief_idea: z.string().max(5000).optional(),
  brief_target_market: z.string().max(2000).optional(),
  brief_constraints: z.string().max(2000).optional(),
  brief_what_you_want: z.string().max(2000).optional(),
});

export type DfyCreateResponse = {
  id: string;
  service: "scout" | "forge" | "prove";
  amountCents: number;
};

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = rateLimit(`dfy-create:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const body = await request.json();
    const input = createSchema.parse(body);

    // Auth is optional — anon orders allowed (we collect email in the form)
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const tier = DFY_PRICING[input.service];

    const serviceClient = createServiceRoleClient();
    const { data: order, error } = await serviceClient
      .from("dfy_orders")
      .insert({
        service: input.service,
        amount_cents: tier.amountCents,
        contact_email: input.contact_email,
        contact_name: input.contact_name ?? null,
        brief_sectors: input.brief_sectors ?? null,
        brief_idea: input.brief_idea ?? null,
        brief_target_market: input.brief_target_market ?? null,
        brief_constraints: input.brief_constraints ?? null,
        brief_what_you_want: input.brief_what_you_want ?? null,
        user_id: user?.id ?? null,
      })
      .select("id, service, amount_cents")
      .single();

    if (error || !order) {
      console.error("[DFY create] failed:", error?.message);
      return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
    }

    return NextResponse.json({
      id: order.id,
      service: order.service,
      amountCents: order.amount_cents,
    } satisfies DfyCreateResponse);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid form input", issues: e.issues }, { status: 400 });
    }
    console.error("[DFY create] error:", e);
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }
}
