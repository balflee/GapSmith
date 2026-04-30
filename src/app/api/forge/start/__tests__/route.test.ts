import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ success: true, remaining: 4 }),
}));

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: vi.fn(),
}));

import { POST } from "../route";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const mockCreateServerSupabaseClient =
  createServerSupabaseClient as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/forge/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null) {
  const selectSingle = vi.fn().mockResolvedValue({
    data: { id: "session-1" },
    error: null,
  });
  const select = vi.fn().mockReturnValue({ single: selectSingle });
  const insert = vi.fn().mockReturnValue({ select });

  mockCreateServerSupabaseClient.mockResolvedValue({
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
    },
    from: () => ({ insert }),
  });

  return { insert, select, selectSingle };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/forge/start", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth(null);

    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 on invalid body (invalid uuid for scout_report_id)", async () => {
    mockAuth({ id: "user-1" });

    const req = makeRequest({ scout_report_id: "not-a-uuid" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 200 with session id on valid request (empty body)", async () => {
    mockAuth({ id: "user-1" });

    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("session-1");
  });

  it("returns 200 with session id when scout_report_id provided", async () => {
    mockAuth({ id: "user-1" });

    const req = makeRequest({
      scout_report_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("session-1");
  });

  it("returns 500 when database insert fails", async () => {
    mockAuth({ id: "user-1" });

    const selectSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });
    const select = vi.fn().mockReturnValue({ single: selectSingle });
    const insert = vi.fn().mockReturnValue({ select });

    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: () => ({ insert }),
    });

    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create forge session");
  });
});
