import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { sendActivationNudge } from "@/lib/email";
import { trackServerEvent } from "@/lib/analytics-server";

export async function GET(req: NextRequest) {
  // Validate cron secret (timing-safe to prevent side-channel attacks)
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find users who signed up > 24h ago, not activated, not yet nudged
  const { data: users, error } = await supabase
    .from("user_status")
    .select("user_id, email, name, created_at")
    .lt("created_at", twentyFourHoursAgo)
    .is("activated_at", null)
    .is("nudge_sent_at", null);

  if (error) {
    console.error("Nudge query error:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let sent = 0;
  for (const user of users ?? []) {
    try {
      const daysSinceSignup = Math.floor(
        (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      await sendActivationNudge(
        user.email,
        user.name,
        "run your first Scout report",
        "/scout"
      );
      await supabase
        .from("user_status")
        .update({ nudge_sent_at: new Date().toISOString() })
        .eq("user_id", user.user_id);
      await trackServerEvent("email_nudge_sent", user.email, {
        recipient: user.email,
        days_since_signup: daysSinceSignup,
      });
      sent++;
    } catch {
      // Skip individual failures, continue with remaining users
    }
  }

  return NextResponse.json({ ok: true, sent });
}
