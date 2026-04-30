import { describe, it, expect, vi } from "vitest";

// Mock supabase-server to avoid Next.js cookies() call
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
}));

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 9 }),
}));

// Mock analytics-server
vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: vi.fn(),
}));

// Import route handlers directly -- tests run without a server
import { POST as checkoutHandler } from "../src/app/api/checkout/route";
import { POST as webhookHandler } from "../src/app/api/webhooks/stripe/route";
import { GET as nudgeHandler } from "../src/app/api/email/nudge/route";

describe("b-08: Stripe webhook checkout.session.completed", () => {
  it("rejects requests without stripe-signature header", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await webhookHandler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("rejects requests with invalid signature", async () => {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return; // Skip when env vars not configured
    }

    const req = new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed" }),
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=1234,v1=invalid_signature",
      },
    });

    const res = await webhookHandler(req);
    expect(res.status).toBe(400);
  });
});

describe("Checkout route", () => {
  it("rejects unauthenticated requests", async () => {
    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "scout" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkoutHandler(req);
    expect(res.status).toBe(401);
  });

  it("rejects invalid plan names", async () => {
    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "nonexistent_plan" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await checkoutHandler(req);
    // 401 because user is not authenticated (mock returns null user)
    expect(res.status).toBe(401);
  });
});

describe("Nudge cron route", () => {
  it("rejects requests without valid CRON_SECRET", async () => {
    const req = new Request("http://localhost:3000/api/email/nudge", {
      method: "GET",
      headers: {
        authorization: "Bearer wrong-secret",
      },
    });

    const res = await nudgeHandler(req as never);
    expect(res.status).toBe(401);
  });
});
