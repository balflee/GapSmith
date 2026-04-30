import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Resolve the public origin behind a reverse proxy (Railway/Vercel/etc).
 * `request.url` reports the internal host (often http://localhost:3000),
 * not the public URL the browser actually used. Order of preference:
 *   1. NEXT_PUBLIC_SITE_URL env var (deterministic, set on Railway)
 *   2. x-forwarded-host + x-forwarded-proto headers (proxy-set)
 *   3. fallback to request.url origin (only correct for local dev)
 */
function resolvePublicOrigin(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.startsWith("http")) return envUrl.replace(/\/$/, "");
  const fwdHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const fwdProto = request.headers.get("x-forwarded-proto") || "https";
  if (fwdHost) return `${fwdProto}://${fwdHost}`;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = resolvePublicOrigin(request);
  if (process.env.DEMO_MODE === "true" && !!process.env.RAILWAY_ENVIRONMENT) {
    throw new Error("DEMO_MODE is not allowed in production");
  }
  if (process.env.DEMO_MODE === "true") return NextResponse.redirect(`${origin}/`);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
