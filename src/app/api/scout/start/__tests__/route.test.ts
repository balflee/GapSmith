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
  return new Request("http://localhost/api/scout/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null) {
  const selectSingle = vi.fn().mockResolvedValue({
    data: { id: "report-1" },
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

describe("POST /api/scout/start", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth(null);

    const req = makeRequest({ sectors: ["fintech"] });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 on invalid body (missing sectors)", async () => {
    mockAuth({ id: "user-1" });

    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 when sectors is empty array", async () => {
    mockAuth({ id: "user-1" });

    const req = makeRequest({ sectors: [] });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 200 with report id on valid request", async () => {
    mockAuth({ id: "user-1" });

    const req = makeRequest({ sectors: ["fintech", "healthtech"] });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("report-1");
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

    const req = makeRequest({ sectors: ["fintech"] });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create scout report");
  });
});
