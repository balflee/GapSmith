import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @solana/web3.js before importing x402
vi.mock("@solana/web3.js", () => {
  const mockGetTransaction = vi.fn();
  const MockConnection = vi.fn().mockImplementation(() => ({
    getTransaction: mockGetTransaction,
  }));
  return {
    Connection: MockConnection,
    PublicKey: vi.fn().mockImplementation((key: string) => ({
      toBase58: () => key,
      toString: () => key,
      equals: (other: { toBase58: () => string }) => key === other.toBase58(),
    })),
    LAMPORTS_PER_SOL: 1_000_000_000,
    clusterApiUrl: vi.fn().mockReturnValue("https://api.mainnet-beta.solana.com"),
  };
});

import {
  usdCentsToSol,
  createPaymentRequest,
  verifyPayment,
  USD_TO_SOL_RATE,
} from "../x402";
import type { X402PaymentRequest, X402PaymentResult } from "../x402";
import { Connection } from "@solana/web3.js";

describe("x402", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.X402_MERCHANT_WALLET = "TestMerchantWallet123456789012345678901234";
    process.env.SOL_USD_RATE = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("usdCentsToSol", () => {
    it("converts 900 cents at $150/SOL to 0.06 SOL", () => {
      // Default rate is 1 SOL = $150 => 900 cents = $9 => 9/150 = 0.06 SOL
      const result = usdCentsToSol(900);
      expect(result).toBeCloseTo(0.06, 6);
    });

    it("converts 0 cents to 0 SOL", () => {
      expect(usdCentsToSol(0)).toBe(0);
    });

    it("handles custom SOL_USD_RATE from env", () => {
      process.env.SOL_USD_RATE = "200";
      // 900 cents = $9, at $200/SOL = 0.045 SOL
      const result = usdCentsToSol(900);
      expect(result).toBeCloseTo(0.045, 6);
    });
  });

  describe("createPaymentRequest", () => {
    it("generates valid request with all fields", () => {
      const req = createPaymentRequest("user-123", "scout", 900);

      expect(req.id).toBeDefined();
      expect(req.id.length).toBeGreaterThan(0);
      expect(req.userId).toBe("user-123");
      expect(req.sku).toBe("scout");
      expect(req.amountUsdCents).toBe(900);
      expect(req.amountSol).toBeCloseTo(0.06, 6);
      expect(req.merchantWallet).toBe("TestMerchantWallet123456789012345678901234");
      expect(req.memo).toContain("user-123");
      expect(req.memo).toContain("scout");
      expect(req.memo).toContain(req.id);
      expect(req.expiresAt).toBeDefined();
      // expiresAt should be ~15 minutes from now
      const expiresAt = new Date(req.expiresAt).getTime();
      const now = Date.now();
      const diffMinutes = (expiresAt - now) / 1000 / 60;
      expect(diffMinutes).toBeGreaterThan(14);
      expect(diffMinutes).toBeLessThan(16);
    });

    it("throws when X402_MERCHANT_WALLET is missing", () => {
      delete process.env.X402_MERCHANT_WALLET;
      expect(() => createPaymentRequest("user-1", "forge", 1200)).toThrow(
        "X402_MERCHANT_WALLET"
      );
    });
  });

  describe("verifyPayment", () => {
    it("returns verified true for valid transaction", async () => {
      process.env.SOLANA_RPC_URL = "https://test-rpc.solana.com";
      const merchantWallet = "TestMerchantWallet123456789012345678901234";
      const expectedSol = 0.06;
      const lamports = Math.round(expectedSol * 1_000_000_000);

      // Mock the Connection.getTransaction to return a valid tx
      const mockGetTx = vi.fn().mockResolvedValue({
        meta: {
          err: null,
          postBalances: [100, lamports + 1000],
          preBalances: [lamports + 1100, 1000],
        },
        transaction: {
          message: {
            accountKeys: [
              { toBase58: () => "SenderWallet" },
              { toBase58: () => merchantWallet },
            ],
          },
        },
      });

      // Override the mock with a function constructor
      (Connection as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        function (this: { getTransaction: typeof mockGetTx }) {
          this.getTransaction = mockGetTx;
        }
      );

      const result = await verifyPayment(
        "pay-123",
        "txSig123",
        expectedSol,
        merchantWallet
      );

      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns verified false when transaction not found", async () => {
      const mockGetTx = vi.fn().mockResolvedValue(null);
      (Connection as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        function (this: { getTransaction: typeof mockGetTx }) {
          this.getTransaction = mockGetTx;
        }
      );

      const result = await verifyPayment(
        "pay-123",
        "txSig456",
        0.06,
        "TestMerchantWallet123456789012345678901234"
      );

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns verified false when transaction has error", async () => {
      const mockGetTx = vi.fn().mockResolvedValue({
        meta: {
          err: { InstructionError: [0, "Custom"] },
          postBalances: [100, 60000000],
          preBalances: [60000100, 0],
        },
        transaction: {
          message: {
            accountKeys: [
              { toBase58: () => "Sender" },
              { toBase58: () => "TestMerchantWallet123456789012345678901234" },
            ],
          },
        },
      });
      (Connection as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        function (this: { getTransaction: typeof mockGetTx }) {
          this.getTransaction = mockGetTx;
        }
      );

      const result = await verifyPayment(
        "pay-123",
        "txSig789",
        0.06,
        "TestMerchantWallet123456789012345678901234"
      );

      expect(result.verified).toBe(false);
      expect(result.error).toContain("failed");
    });
  });
});
