import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: vi.fn(),
}));

import { POST } from "../route";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";

const mockCreateServerSupabaseClient =
  createServerSupabaseClient as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Clear env vars
  delete process.env.X402_MERCHANT_WALLET;
  delete process.env.SOL_USD_RATE;
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/checkout/x402", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockUnauthenticated() {
  mockCreateServerSupabaseClient.mockResolvedValue({
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: null }, error: null }),
    },
  });
}

function mockAuthenticated(userId = "user-1") {
  mockCreateServerSupabaseClient.mockResolvedValue({
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: userId } },
          error: null,
        }),
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: "payment-uuid-1" }, error: null }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  });
}

describe("POST /api/checkout/x402", () => {
  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await POST(makeRequest({ plan: "scout" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 503 when X402_MERCHANT_WALLET not set", async () => {
    mockAuthenticated();
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });

    const res = await POST(makeRequest({ plan: "scout" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("not configured");
  });

  it("returns 400 on invalid plan", async () => {
    mockAuthenticated();
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });
    process.env.X402_MERCHANT_WALLET = "SoLwALLet123";

    const res = await POST(makeRequest({ plan: "invalidplan" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 429 when rate limited", async () => {
    mockAuthenticated();
    mockRateLimit.mockReturnValue({ success: false, remaining: 0 });

    const res = await POST(makeRequest({ plan: "scout" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
  });

  it("returns payment details with correct SOL amount for scout plan", async () => {
    mockAuthenticated("user-42");
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });
    process.env.X402_MERCHANT_WALLET = "SoLwALLet123";
    // Default SOL_USD_RATE = 150, scout = 900 cents
    // amountSol = 900 / (150 * 100) = 0.06

    const res = await POST(makeRequest({ plan: "scout" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentId).toBeDefined();
    expect(body.amountSol).toBe(0.06);
    expect(body.amountUsdCents).toBe(900);
    expect(body.merchantWallet).toBe("SoLwALLet123");
    expect(body.memo).toContain("gapsmith:user-42:scout:");
    expect(body.expiresAt).toBeDefined();
  });

  it("uses custom SOL_USD_RATE from env var", async () => {
    mockAuthenticated("user-42");
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });
    process.env.X402_MERCHANT_WALLET = "SoLwALLet123";
    process.env.SOL_USD_RATE = "200";
    // amountSol = 900 / (200 * 100) = 0.045

    const res = await POST(makeRequest({ plan: "scout" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.amountSol).toBe(0.045);
  });
});
