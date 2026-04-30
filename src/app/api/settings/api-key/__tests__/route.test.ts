import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn().mockResolvedValue("encrypted-value"),
}));

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: vi.fn(),
}));

import { POST, GET, DELETE } from "../route";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const mockCreateServerSupabaseClient =
  createServerSupabaseClient as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/settings/api-key", () => {
  it("returns 401 when not authenticated", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: null }, error: null }),
      },
    });

    const req = new Request("http://localhost/api/settings/api-key", {
      method: "POST",
      body: JSON.stringify({
        provider: "openai",
        apiKey: "sk-test-123",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 on invalid body", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: "user-1" } },
            error: null,
          }),
      },
    });

    process.env.ENCRYPTION_SECRET = "a".repeat(64);

    const req = new Request("http://localhost/api/settings/api-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");

    delete process.env.ENCRYPTION_SECRET;
  });
});

describe("GET /api/settings/api-key", () => {
  it("returns 401 when not authenticated", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: null }, error: null }),
      },
    });

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns all keys for the authenticated user with key_preview", async () => {
    const mockKeys = [
      {
        id: "key-1",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        created_at: "2026-04-18T12:00:00Z",
        encrypted_key: "enc_abc123xyz789",
      },
      {
        id: "key-2",
        provider: "openai",
        model: "gpt-5.4",
        created_at: "2026-04-19T12:00:00Z",
        encrypted_key: "enc_def456uvw012",
      },
    ];

    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: "user-1" } },
            error: null,
          }),
      },
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: mockKeys, error: null }),
        }),
      }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toHaveLength(2);
    expect(body.keys[0].provider).toBe("anthropic");
    expect(body.keys[0].key_preview).toBe("xyz789");
    expect(body.keys[1].provider).toBe("openai");
    expect(body.keys[1].key_preview).toBe("uvw012");
    // encrypted_key should NOT be in the response
    expect(body.keys[0].encrypted_key).toBeUndefined();
  });

  it("returns empty array when user has no keys", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: "user-1" } },
            error: null,
          }),
      },
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toEqual([]);
  });
});

describe("DELETE /api/settings/api-key", () => {
  it("returns 401 when not authenticated", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: null }, error: null }),
      },
    });

    const req = new Request("http://localhost/api/settings/api-key", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "key-1" }),
    });

    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: "user-1" } },
            error: null,
          }),
      },
    });

    const req = new Request("http://localhost/api/settings/api-key", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("deletes a key by id scoped to the user", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: "user-1" } },
            error: null,
          }),
      },
      from: () => ({
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      }),
    });

    const req = new Request("http://localhost/api/settings/api-key", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "key-1" }),
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
