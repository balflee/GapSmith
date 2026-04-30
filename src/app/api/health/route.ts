import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { POSTHOG_KEY, POSTHOG_HOST } from "@/lib/analytics-server";

export async function GET() {
  const checks: Record<string, "ok" | "degraded" | "error"> = {};

  // Database connectivity check
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("purchase_counts").select("sku").limit(1);
    checks.database = error ? "error" : "ok";
    if (error) console.error("Health check database error:", error.message);
  } catch (e) {
    checks.database = "error";
    console.error("Health check database error:", (e as Error).message);
  }

  // Auth service check
  try {
    const supabase = await createServerSupabaseClient();
    // Expects an auth error (no session), not a network error
    await supabase.auth.getUser();
    checks.auth = "ok";
  } catch (e) {
    checks.auth = "error";
    console.error("Health check auth error:", (e as Error).message);
  }

  // Analytics reachability check
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(POSTHOG_HOST + "/decide?v=3", {
      method: "POST",
      body: JSON.stringify({ api_key: POSTHOG_KEY, distinct_id: "healthcheck" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    checks.analytics = res.ok ? "ok" : "error";
  } catch (e) {
    const isTimeout = (e as Error).name === "AbortError";
    checks.analytics = isTimeout ? "degraded" : "error";
    console.error("Health check analytics error:", (e as Error).message);
  }

  // Payment configuration check
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    checks.payment = key && key.startsWith("sk_") ? "ok" : "error";
    if (!key || !key.startsWith("sk_")) {
      console.error("Health check payment error: STRIPE_SECRET_KEY missing or invalid format");
    }
  } catch (e) {
    checks.payment = "error";
    console.error("Health check payment error:", (e as Error).message);
  }

  const critical = Object.entries(checks).filter(([k]) => ["database", "auth"].includes(k));
  const hasCriticalFailure = critical.some(([, v]) => v === "error");

  return NextResponse.json(
    { status: hasCriticalFailure ? "degraded" : "ok" },
    { status: hasCriticalFailure ? 503 : 200 }
  );
}
