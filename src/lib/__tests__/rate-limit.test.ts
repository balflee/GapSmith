import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rateLimit } from "../rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first request succeeds with correct remaining count", () => {
    const result = rateLimit("test-first", { limit: 5, windowMs: 60_000 });
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("requests up to limit succeed, then next fails", () => {
    const key = "test-limit";
    const limit = 3;

    for (let i = 0; i < limit; i++) {
      const result = rateLimit(key, { limit, windowMs: 60_000 });
      expect(result.success).toBe(true);
    }

    const blocked = rateLimit(key, { limit, windowMs: 60_000 });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("different keys have independent limits", () => {
    const limit = 2;

    // Exhaust key-a
    rateLimit("key-a", { limit, windowMs: 60_000 });
    rateLimit("key-a", { limit, windowMs: 60_000 });
    const blockedA = rateLimit("key-a", { limit, windowMs: 60_000 });
    expect(blockedA.success).toBe(false);

    // key-b should still work
    const resultB = rateLimit("key-b", { limit, windowMs: 60_000 });
    expect(resultB.success).toBe(true);
    expect(resultB.remaining).toBe(1);
  });

  it("window reset allows requests again", () => {
    const key = "test-reset";
    const limit = 2;
    const windowMs = 10_000;

    rateLimit(key, { limit, windowMs });
    rateLimit(key, { limit, windowMs });
    const blocked = rateLimit(key, { limit, windowMs });
    expect(blocked.success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    const afterReset = rateLimit(key, { limit, windowMs });
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(1);
  });
});
