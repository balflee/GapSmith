"use client";

/**
 * Phantom wallet integration for x402 USDC payments — browser only.
 *
 * Builds an SPL transferChecked + memo transaction, lets Phantom sign+submit,
 * returns the transaction signature for server-side verification.
 *
 * No wallet-adapter deps yet — we'll add multi-wallet support (Solflare/Backpack)
 * in a follow-up if user demand justifies it.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export type X402Quote = {
  paymentId: string;
  sku: string;
  paymentToken: "sol" | "usdc";
  network: "devnet" | "mainnet";
  merchantWallet: string;
  memo: string;
  expiresAt: string;
  // USDC-specific
  amountUsdc: string | null;
  amountUsdcAtomic: string | null;
  usdcMint: string | null;
  merchantUsdcAta: string | null;
  decimals: number;
  // misc
  amountUsdCents: number;
  amountSol: number;
};

export class PaymentError extends Error {
  constructor(
    public code:
      | "PHANTOM_NOT_INSTALLED"
      | "USER_REJECTED"
      | "INSUFFICIENT_USDC"
      | "INSUFFICIENT_SOL_GAS"
      | "TX_FAILED"
      | "UNSUPPORTED_TOKEN"
      | "MISSING_FIELDS",
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

/** Minimum SOL needed for SPL transferChecked + memo + rent reserve. ~0.000005 SOL gas + buffer. */
const MIN_SOL_FOR_GAS = 1_000_000; // 0.001 SOL in lamports — generous safety margin

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
}

function getPhantom(): PhantomProvider {
  // Phantom exposes itself at window.phantom.solana (newer) or window.solana (legacy)
  const w = window as unknown as {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  };
  const provider = w.phantom?.solana ?? w.solana;
  if (!provider?.isPhantom) {
    throw new PaymentError(
      "PHANTOM_NOT_INSTALLED",
      "Phantom wallet not detected. Install from https://phantom.app/"
    );
  }
  return provider;
}

function rpcUrlFor(network: "devnet" | "mainnet"): string {
  // Public Solana RPC (clusterApiUrl) is CORS-blocked from browsers since 2024
  // — Solana Foundation rejects browser-origin RPC traffic to fight abuse.
  // We use a paid RPC (Helius) exposed via NEXT_PUBLIC_SOLANA_RPC_URL for
  // mainnet. Devnet's public RPC still accepts browser traffic, so we keep
  // clusterApiUrl as fallback there.
  const envUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (envUrl && envUrl.startsWith("http")) return envUrl;
  return network === "devnet" ? clusterApiUrl("devnet") : clusterApiUrl("mainnet-beta");
}

/**
 * Build + sign + send an SPL USDC transferChecked from the connected Phantom wallet
 * to the merchant's USDC ATA, with a memo binding the tx to this payment.
 *
 * Returns the tx signature once submitted (not yet confirmed — verify route polls).
 */
export async function payWithPhantom(quote: X402Quote): Promise<string> {
  if (quote.paymentToken !== "usdc") {
    throw new PaymentError(
      "UNSUPPORTED_TOKEN",
      `Only USDC payments are supported by this client (got ${quote.paymentToken})`
    );
  }
  if (!quote.usdcMint || !quote.merchantUsdcAta || !quote.amountUsdcAtomic) {
    throw new PaymentError("MISSING_FIELDS", "Quote missing USDC fields");
  }

  const provider = getPhantom();

  // 1. Connect (Phantom popup if not already connected)
  let userPubkey: PublicKey;
  try {
    const resp = await provider.connect();
    userPubkey = resp.publicKey;
  } catch (err) {
    throw new PaymentError("USER_REJECTED", "User rejected wallet connection", err);
  }

  const connection = new Connection(rpcUrlFor(quote.network), "confirmed");
  const mintPubkey = new PublicKey(quote.usdcMint);
  const merchantAtaPubkey = new PublicKey(quote.merchantUsdcAta);
  const expectedAtomic = BigInt(quote.amountUsdcAtomic);

  // 2a. Pre-flight SOL gas check — SPL transfer + memo costs ~5000 lamports.
  // Without SOL, Phantom shows generic "Transaction failed" with no hint.
  const solBalance = await connection.getBalance(userPubkey);
  if (solBalance < MIN_SOL_FOR_GAS) {
    throw new PaymentError(
      "INSUFFICIENT_SOL_GAS",
      quote.network === "devnet"
        ? "Need ~0.001 SOL for network fees. Get devnet SOL: faucet.solana.com"
        : "Need ~0.001 SOL for network fees. Buy SOL or transfer some to your wallet."
    );
  }

  // 2b. Derive sender's USDC ATA (must already exist + be funded; we don't auto-create)
  const senderAta = await getAssociatedTokenAddress(mintPubkey, userPubkey);
  try {
    const acct = await getAccount(connection, senderAta);
    if (acct.amount < expectedAtomic) {
      throw new PaymentError(
        "INSUFFICIENT_USDC",
        `Insufficient USDC: have ${acct.amount}, need ${expectedAtomic}`
      );
    }
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    // Account not found → user has 0 USDC of this mint
    throw new PaymentError(
      "INSUFFICIENT_USDC",
      "No USDC balance found in your Phantom wallet for this network",
      err
    );
  }

  // 3. Build instructions:
  //   (a) Idempotent ATA creation for merchant — pays rent (~0.00204 SOL) only on first
  //       buyer for this mint+merchant. SPL transferChecked fails if destination ATA
  //       doesn't exist, so this guards against that for fresh merchant wallets.
  //   (b) USDC transferChecked sender → merchant
  //   (c) Memo binding the tx to the off-chain x402 quote
  const ensureMerchantAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    userPubkey,           // payer (rent comes from sender's SOL)
    merchantAtaPubkey,    // ATA address
    new PublicKey(quote.merchantWallet), // owner of ATA
    mintPubkey,           // mint
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const transferIx = createTransferCheckedInstruction(
    senderAta,
    mintPubkey,
    merchantAtaPubkey,
    userPubkey,
    expectedAtomic,
    quote.decimals,
    [],
    TOKEN_PROGRAM_ID
  );

  const memoIx = new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(quote.memo, "utf8"),
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: userPubkey,
    blockhash,
    lastValidBlockHeight,
  });
  tx.add(ensureMerchantAtaIx, transferIx, memoIx);

  // 4. Phantom signs + sends
  let signature: string;
  try {
    const result = await provider.signAndSendTransaction(tx);
    signature = result.signature;
  } catch (err) {
    const msg = String((err as { message?: string })?.message ?? err);
    if (/user rejected|cancelled|denied/i.test(msg)) {
      throw new PaymentError("USER_REJECTED", "User rejected the transaction", err);
    }
    throw new PaymentError("TX_FAILED", msg, err);
  }

  // 5. Wait for confirmation (so server-side verify finds it on first try)
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return signature;
}
