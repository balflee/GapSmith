import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/email";
import { trackServerEvent } from "@/lib/analytics-server";

export const welcomeSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(200),
  ctaUrl: z.string().max(500).optional(),
});

export type WelcomeEmailResponse = { ok: true };

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = welcomeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    await sendWelcomeEmail(parsed.data.email, parsed.data.name, parsed.data.ctaUrl || "/");
    await trackServerEvent("email_welcome_sent", parsed.data.email, { recipient: parsed.data.email });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Welcome email error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
