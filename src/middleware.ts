import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/terms",
  "/contact",
  "/changelog",
  "/docs",
  "/docs/api",
  "/docs/done-for-you",
  "/docs/quickstart",
  "/docs/architecture",
  "/docs/x402",
  "/docs/pipelines",
  "/auth/callback",
  "/auth/reset-password",
  "/api/health",
  "/order/scout",
  "/order/forge",
  "/order/prove",
  "/order/success",
];

/** Map of route prefix → SKU that gates it. Reports (/scout-report etc) intentionally absent — they stay login-only so users can revisit past sessions. */
const SKU_GATED_PREFIXES: Array<{ prefix: string; sku: "scout" | "forge" | "prove" }> = [
  { prefix: "/scout", sku: "scout" },
  { prefix: "/forge", sku: "forge" },
  { prefix: "/prove", sku: "prove" },
];

function findSkuGate(pathname: string): "scout" | "forge" | "prove" | null {
  for (const { prefix, sku } of SKU_GATED_PREFIXES) {
    // Match exactly or with sub-path, but NOT /scout-report (different prefix)
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return sku;
    }
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths, static files, and API routes
  if (
    publicPaths.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/v/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Bypass auth in demo mode (no Supabase credentials available)
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // SKU ownership gate for /scout, /forge, /prove (NOT their *-report variants)
  const gateSku = findSkuGate(pathname);
  if (gateSku) {
    // Inline ownership check — accounts for bundle/CLI sub-grants. Single query.
    const grantingSkus = [gateSku, "bundle", "cli"];
    const { data: rows } = await supabase
      .from("purchases")
      .select("id")
      .eq("user_id", user.id)
      .in("sku", grantingSkus)
      .limit(1);
    const owned = (rows?.length ?? 0) > 0;
    if (!owned) {
      const pricingUrl = new URL("/pricing", request.url);
      pricingUrl.searchParams.set("unlock", gateSku);
      return NextResponse.redirect(pricingUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
