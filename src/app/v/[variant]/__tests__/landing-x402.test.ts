import { describe, it, expect, vi } from "vitest";

// Mock analytics to avoid PostHog initialization
vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

import { trackX402PayStart } from "@/lib/events";
import { track } from "@/lib/analytics";

const mockTrack = track as ReturnType<typeof vi.fn>;

describe("x402 Solana payment integration on landing page", () => {
  it("trackX402PayStart fires x402_pay_start event with correct properties", () => {
    trackX402PayStart({ plan: "scout", amount_sol: 0.06 });

    expect(mockTrack).toHaveBeenCalledWith("x402_pay_start", {
      plan: "scout",
      amount_sol: 0.06,
      funnel_stage: "monetize",
    });
  });

  it("trackX402PayStart includes payment_method: x402_solana", () => {
    mockTrack.mockClear();
    trackX402PayStart({ plan: "bundle", amount_sol: 0.19 });

    expect(mockTrack).toHaveBeenCalledWith(
      "x402_pay_start",
      expect.objectContaining({ plan: "bundle", amount_sol: 0.19 })
    );
  });
});
