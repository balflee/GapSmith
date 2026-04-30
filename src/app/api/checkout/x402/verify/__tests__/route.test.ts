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
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { trackServerEvent } from "@/lib/analytics-server";

const mockCreateServerSupabaseClient =
  createServerSupabaseClient as ReturnType<typeof vi.fn>;
const mockCreateServiceRoleClient =
  createServiceRoleClient as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockTrackServerEvent = trackServerEvent as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SOLANA_RPC_URL;
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/checkout/x402/verify", {
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
  });
}

function mockServiceRole(opts: {
  pendingPayment?: Record<string, unknown> | null;
  selectError?: { message: string } | null;
}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const insertMock = vi.fn().mockResolvedValue({ error: null });

  mockCreateServiceRoleClient.mockReturnValue({
    from: (table: string) => {
      if (table === "x402_pending_payments") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: opts.pendingPayment ?? null,
                  error: opts.selectError ?? (opts.pendingPayment ? null : { message: "Not found" }),
                }),
            }),
          }),
          update: updateMock,
        };
      }
      if (table === "purchases") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      if (table === "purchase_counts") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { count: 5 }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      return {};
    },
  });
  return { updateMock, insertMock };
}

describe("POST /api/checkout/x402/verify", () => {
  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await POST(
      makeRequest({ paymentId: "abc", txSignature: "def" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    mockAuthenticated();
    mockRateLimit.mockReturnValue({ success: false, remaining: 0 });

    const res = await POST(
      makeRequest({ paymentId: "abc", txSignature: "def" })
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
  });

  it("returns 400 on invalid body (missing fields)", async () => {
    mockAuthenticated();
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 404 when payment not found", async () => {
    mockAuthenticated("user-1");
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });
    mockServiceRole({ pendingPayment: null });

    const res = await POST(
      makeRequest({ paymentId: "nonexistent", txSignature: "sig123" })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.verified).toBe(false);
    expect(body.error).toContain("not found");
  });

  it("returns 403 when payment belongs to different user", async () => {
    mockAuthenticated("user-1");
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });
    mockServiceRole({
      pendingPayment: {
        id: "pay-1",
        user_id: "user-2", // different user
        sku: "scout",
        amount_sol: 0.06,
        amount_usd_cents: 900,
        merchant_wallet: "wallet123",
        memo: "gapsmith:user-2:scout:pay-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    });

    const res = await POST(
      makeRequest({ paymentId: "pay-1", txSignature: "sig123" })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.verified).toBe(false);
  });

  it("returns expired error when payment is older than 15 minutes", async () => {
    mockAuthenticated("user-1");
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });
    mockServiceRole({
      pendingPayment: {
        id: "pay-1",
        user_id: "user-1",
        sku: "scout",
        amount_sol: 0.06,
        amount_usd_cents: 900,
        merchant_wallet: "wallet123",
        memo: "gapsmith:user-1:scout:pay-1",
        status: "pending",
        created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min ago
      },
    });

    const res = await POST(
      makeRequest({ paymentId: "pay-1", txSignature: "sig123" })
    );
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.verified).toBe(false);
    expect(body.error).toContain("expired");
  });
});
