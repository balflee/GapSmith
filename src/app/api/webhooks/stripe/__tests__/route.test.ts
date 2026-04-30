import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
}));

import { POST } from "../route";
import { rateLimit } from "@/lib/rate-limit";

const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 when no stripe-signature header", async () => {
    mockRateLimit.mockReturnValue({ success: true, remaining: 29 });

    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Bad request");
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValue({ success: false, remaining: 0 });

    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
  });
});
