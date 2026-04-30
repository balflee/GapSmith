import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendActivationNudge: vi.fn(),
}));

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: vi.fn(),
}));

import { GET } from "../route";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/email/nudge", () => {
  it("returns 401 when no authorization header", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const req = new NextRequest("http://localhost/api/email/nudge", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");

    delete process.env.CRON_SECRET;
  });

  it("returns 401 when wrong secret", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const req = new NextRequest("http://localhost/api/email/nudge", {
      method: "GET",
      headers: {
        authorization: "Bearer wrong-secret",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");

    delete process.env.CRON_SECRET;
  });
});
