// x402 Solana micropayment library for GapSmith
// Supports two payment tokens:
//  - 'sol'  : native SOL transfer (legacy, retained for backwards-compat)
//  - 'usdc' : SPL USDC transferChecked (preferred — stable pricing matches USD bonding curve)

import { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";

// --- Types ---

export type SolanaNetwork = "devnet" | "mainnet";
export type PaymentToken = "sol" | "usdc";

export interface X402PaymentRequest {
  id: string;
  userId: string;
  sku: string;
  amountUsdCents: number;
  amountSol: number;
  amountUsdcAtomic: bigint; // USDC has 6 decimals
  paymentToken: PaymentToken;
  network: SolanaNetwork;
  merchantWallet: string;
  memo: string;
  expiresAt: string; // ISO 8601
}

export interface X402PaymentResult {
  verified: boolean;
  error?: string;
}

// --- USDC mint addresses ---
// Native USDC (Circle), 6 decimals on both networks.
export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_DECIMALS = 6;

// --- Constants ---

/** Default SOL/USD rate: 1 SOL = $150. Override with SOL_USD_RATE env var. Used only for legacy 'sol' path. */
export const USD_TO_SOL_RATE = 150;

// --- Helpers ---

export function getNetwork(): SolanaNetwork {
  const v = (process.env.SOL_NETWORK ?? "mainnet").toLowerCase();
  return v === "devnet" ? "devnet" : "mainnet";
}

export function getUsdcMint(network?: SolanaNetwork): string {
  const n = network ?? getNetwork();
  return n === "devnet" ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
}

function getSolUsdRate(): number {
  const envRate = process.env.SOL_USD_RATE;
  if (envRate && Number(envRate) > 0) {
    return Number(envRate);
  }
  return USD_TO_SOL_RATE;
}

export function getMerchantWallet(): string {
  const wallet = process.env.X402_MERCHANT_WALLET;
  if (!wallet) {
    throw new Error(
      "X402_MERCHANT_WALLET environment variable is not configured. " +
        "Set it to your Solana wallet address to receive payments."
    );
  }
  return wallet;
}

function getRpcUrlForNetwork(network: SolanaNetwork): string {
  // Network-specific overrides take precedence so we don't accidentally send
  // devnet queries to a Helius mainnet URL (or vice versa).
  if (network === "mainnet") {
    const m = process.env.SOLANA_MAINNET_RPC_URL ?? process.env.SOLANA_RPC_URL;
    if (m) return m;
    return clusterApiUrl("mainnet-beta");
  }
  // devnet — public RPC is fine here (server-side, no CORS issue)
  const d = process.env.SOLANA_DEVNET_RPC_URL;
  if (d) return d;
  return clusterApiUrl("devnet");
}

function getSolanaConnection(network?: SolanaNetwork): Connection {
  const n = network ?? getNetwork();
  return new Connection(getRpcUrlForNetwork(n), "confirmed");
}

function generatePaymentId(): string {
  return `x402_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// --- Public API ---

/** Convert USD cents to SOL amount. */
export function usdCentsToSol(cents: number): number {
  if (cents === 0) return 0;
  const rate = getSolUsdRate();
  return cents / 100 / rate;
}

/** Convert USD cents to USDC atomic units (6 decimals). 490 cents → 4_900_000n. */
export function usdCentsToUsdcAtomic(cents: number): bigint {
  // 1 USDC == 100 cents == 1_000_000 atomic. So atomic = cents * 10_000.
  return BigInt(cents) * BigInt(10000);
}

/** Format USDC atomic to display string. 4_900_000n → "4.90". */
export function formatUsdcAtomic(atomic: bigint): string {
  const million = BigInt(1_000_000);
  const whole = atomic / million;
  const frac = atomic % million;
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2); // 2 decimals
  return `${whole}.${fracStr}`;
}

/**
 * Create a payment request for x402 Solana micropayment.
 * Throws if X402_MERCHANT_WALLET env var is missing.
 */
export function createPaymentRequest(
  userId: string,
  sku: string,
  amountUsdCents: number,
  paymentToken: PaymentToken = "usdc"
): X402PaymentRequest {
  const merchantWallet = getMerchantWallet();
  const network = getNetwork();
  const id = generatePaymentId();
  const amountSol = usdCentsToSol(amountUsdCents);
  const amountUsdcAtomic = usdCentsToUsdcAtomic(amountUsdCents);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const memo = `gapsmith:${userId}:${sku}:${id}`;

  return {
    id,
    userId,
    sku,
    amountUsdCents,
    amountSol,
    amountUsdcAtomic,
    paymentToken,
    network,
    merchantWallet,
    memo,
    expiresAt,
  };
}

// ============================================================
// Verification
// ============================================================

interface ParsedInstruction {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
}

interface SolanaTxParsed {
  meta?: {
    err?: unknown;
    preBalances?: number[];
    postBalances?: number[];
  } | null;
  transaction?: {
    message?: {
      instructions?: ParsedInstruction[];
      accountKeys?: Array<{ pubkey: string }>;
    };
  };
}

/**
 * Fetch parsed transaction via JSON-RPC.
 * Used for both 'sol' (legacy verifyPayment) and 'usdc' (verifyUsdcPayment).
 */
async function fetchParsedTransaction(
  txSignature: string,
  network: SolanaNetwork
): Promise<SolanaTxParsed | null> {
  const rpcUrl = getRpcUrlForNetwork(network);
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [txSignature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
    }),
  });
  const json = await resp.json();
  return json.result ?? null;
}

/**
 * Verify a native SOL transfer to merchantWallet within 1% tolerance.
 * Legacy path — kept for backwards-compat with rows where payment_token='sol'.
 */
export async function verifyPayment(
  paymentId: string,
  txSignature: string,
  expectedSol: number,
  merchantWallet: string,
  network?: SolanaNetwork
): Promise<X402PaymentResult> {
  const n = network ?? getNetwork();
  const connection = getSolanaConnection(n);

  const tx = await connection.getTransaction(txSignature, {
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    return { verified: false, error: `Transaction ${txSignature} not found` };
  }

  if (tx.meta?.err) {
    return {
      verified: false,
      error: `Transaction failed: ${JSON.stringify(tx.meta.err)}`,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = tx.transaction.message as any;
  const accountKeys: { toBase58(): string }[] =
    message.accountKeys ?? message.getAccountKeys?.()?.keySegments?.()?.flat?.() ?? [];
  let merchantIndex = -1;
  for (let i = 0; i < accountKeys.length; i++) {
    if (accountKeys[i].toBase58() === merchantWallet) {
      merchantIndex = i;
      break;
    }
  }

  if (merchantIndex === -1) {
    return {
      verified: false,
      error: `Merchant wallet ${merchantWallet} not found in transaction`,
    };
  }

  const preBalance = tx.meta!.preBalances[merchantIndex];
  const postBalance = tx.meta!.postBalances[merchantIndex];
  const receivedLamports = postBalance - preBalance;
  const receivedSol = receivedLamports / LAMPORTS_PER_SOL;

  const tolerance = expectedSol * 0.01;
  if (Math.abs(receivedSol - expectedSol) > tolerance) {
    return {
      verified: false,
      error: `Amount mismatch: expected ${expectedSol} SOL, received ${receivedSol} SOL`,
    };
  }

  return { verified: true };
}

/**
 * Verify an SPL USDC transferChecked (or transfer) to merchant's USDC ATA.
 * Checks: confirmed, mint, destination ATA, amount ≥ expected, memo present (if provided).
 *
 * Why we accept BOTH transfer and transferChecked: Phantom's signAndSendTransaction
 * may produce either; transferChecked is preferred but transfer is still common.
 */
export async function verifyUsdcPayment(args: {
  txSignature: string;
  expectedAtomic: bigint;
  merchantUsdcAta: string;
  expectedMint: string;
  expectedMemo?: string;
  network?: SolanaNetwork;
}): Promise<X402PaymentResult> {
  const network = args.network ?? getNetwork();
  const tx = await fetchParsedTransaction(args.txSignature, network);
  if (!tx) {
    return { verified: false, error: `Transaction ${args.txSignature} not found` };
  }
  if (tx.meta?.err) {
    return { verified: false, error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` };
  }

  const instructions = tx.transaction?.message?.instructions ?? [];

  // Look for an SPL transferChecked or transfer to merchant ATA with matching mint + amount
  let usdcOk = false;
  for (const ix of instructions) {
    if (ix.program !== "spl-token") continue;
    const t = ix.parsed?.type;
    const info = (ix.parsed?.info ?? {}) as Record<string, unknown>;
    if (t === "transferChecked") {
      const dest = info.destination as string | undefined;
      const mint = info.mint as string | undefined;
      const amt = info.tokenAmount as { amount?: string } | undefined;
      if (
        dest === args.merchantUsdcAta &&
        mint === args.expectedMint &&
        amt?.amount &&
        BigInt(amt.amount) >= args.expectedAtomic
      ) {
        usdcOk = true;
        break;
      }
    } else if (t === "transfer") {
      // Fallback: plain transfer (no mint in instruction). We trust destination ATA was created
      // for our expected mint — if user crafted an ATA for a different mint, the transfer would
      // have failed on-chain.
      const dest = info.destination as string | undefined;
      const amt = info.amount as string | undefined;
      if (
        dest === args.merchantUsdcAta &&
        amt &&
        BigInt(amt) >= args.expectedAtomic
      ) {
        usdcOk = true;
        break;
      }
    }
  }

  if (!usdcOk) {
    return {
      verified: false,
      error: "No SPL USDC transfer to merchant ATA matching expected amount",
    };
  }

  // Memo check (optional — payment is bound to merchant ATA + amount, but memo adds idempotency)
  if (args.expectedMemo) {
    const memoIx = instructions.find(
      (ix) =>
        ix.programId === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" ||
        ix.program === "spl-memo"
    );
    if (!memoIx) {
      return { verified: false, error: "Memo instruction missing" };
    }
    // For memo program, parsed value is the memo string itself
    const memoText =
      (memoIx.parsed as unknown as string) ??
      (memoIx.parsed?.info as { memo?: string } | undefined)?.memo;
    if (typeof memoText === "string" && !memoText.includes(args.expectedMemo)) {
      return { verified: false, error: "Memo mismatch" };
    }
  }

  return { verified: true };
}
