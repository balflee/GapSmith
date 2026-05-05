/**
 * Tests for the validateBody pre-payment hook in withX402Payment.
 *
 * The hook protects agents from burning USDC on requests with malformed
 * bodies. Without it, the wrapper's first response is always 402, the
 * agent pays, and only then does the handler discover the body is bad
 * and return 422 — but the on-chain settlement is irreversible.
 */

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// Mock environment so x402 utilities don't try to read network config from env
vi.mock("@/lib/x402", () => ({
  getMerchantWallet: () => "BuBjMDp2B9dPxFHjWU4qWZBQKKWkAXoiPts2GWGN9Rbv",
  getNetwork: () => "mainnet",
  getUsdcMint: () => "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDC_DECIMALS: 6,
  verifyUsdcPayment: vi.fn(),
  formatUsdcAtomic: (atomic: bigint) => (Number(atomic) / 1_000_000).toFixed(2),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "test_job" }, error: null }),
        }),
      }),
    }),
  }),
}));

import { withX402Payment } from "@/lib/x402-server";

const schema = z.object({
  profile: z.enum(["Solo", "Funded"]),
  budget: z.string(),
}).strict();

const handler = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ ok: true }), { status: 200 }),
);

const POST = withX402Payment(handler, {
  description: "Test endpoint",
  priceUsdcAtomic: BigInt(1_000_000),
  async: true,
  validateBody: (raw) => {
    const r = schema.safeParse(raw);
    return r.success
      ? { ok: true, body: r.data }
      : { ok: false, errors: r.error.flatten() };
  },
});

function makeRequest(body: unknown, opts: { hasPayment?: boolean; method?: string } = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-host": "test.example",
    "x-forwarded-proto": "https",
  };
  if (opts.hasPayment) {
    headers["X-PAYMENT"] = "ZGVhZGJlZWY="; // dummy base64 — won't reach verify
  }
  return new Request("https://test.example/api/v1/x", {
    method: opts.method ?? "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("withX402Payment validateBody hook", () => {
  it("returns 422 with details when body is invalid (no payment burned)", async () => {
    handler.mockClear();
    const res = await POST(makeRequest({ profile: "solo", budget: "$1K" })); // wrong case
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid_body");
    expect(body.error).toMatch(/validation/i);
    expect(body.details).toBeDefined();
    // Most importantly: handler was NOT called.
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_json when body isn't valid JSON", async () => {
    handler.mockClear();
    const res = await POST(makeRequest("not-json{{", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_json");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 402 (not 422) when body is VALID and no payment header is set", async () => {
    handler.mockClear();
    const res = await POST(makeRequest({ profile: "Solo", budget: "$1K" }));
    expect(res.status).toBe(402);
    const body = await res.json();
    // Standard x402 envelope:
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toBeInstanceOf(Array);
    expect(handler).not.toHaveBeenCalled();
  });

  it("treats GET (no body) as if validateBody is a no-op and skips straight to 402", async () => {
    handler.mockClear();
    const req = new Request("https://test.example/api/v1/x", {
      method: "GET",
      headers: { "x-forwarded-host": "test.example", "x-forwarded-proto": "https" },
    });
    const res = await POST(req);
    expect(res.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
  });

  it("treats empty body on POST as `{}` (validation runs against empty object)", async () => {
    handler.mockClear();
    // Empty string body — schema requires profile so this should fail validation
    const req = new Request("https://test.example/api/v1/x", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-host": "test.example", "x-forwarded-proto": "https" },
      body: "",
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(handler).not.toHaveBeenCalled();
  });
});
