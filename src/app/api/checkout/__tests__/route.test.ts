import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
}));

import { POST } from "../route";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";

const mockCreateServerSupabaseClient =
  createServerSupabaseClient as ReturnType<typeof vi.fn>;
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/checkout", () => {
  it("returns 401 when not authenticated", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: null }, error: null }),
      },
    });

    const req = new Request("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "scout" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 on invalid body (missing plan field)", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: "user-1" } },
            error: null,
          }),
      },
    });
    mockRateLimit.mockReturnValue({ success: true, remaining: 9 });

    const req = new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 429 when rate limited", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: "user-1" } },
            error: null,
          }),
      },
    });
    mockRateLimit.mockReturnValue({ success: false, remaining: 0 });

    const req = new Request("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "scout" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
  });
});
