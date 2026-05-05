/**
 * Server-side x402 protocol helper.
 *
 * Wraps a route handler so it returns HTTP 402 Payment Required when no
 * X-PAYMENT header is present, and processes the request normally once
 * a valid Solana USDC payment proof is provided.
 *
 * Roughly compliant with Coinbase's x402 spec (https://docs.cdp.coinbase.com/x402)
 * adapted to Solana SPL transfers. The 402 body shape and X-PAYMENT header
 * encoding match the spec; signature verification is Solana-native via
 * verifyUsdcPayment from src/lib/x402.ts.
 *
 * Idempotency: tx_hash is UNIQUE in agent_jobs — replaying the same payment
 * returns the original cached result for sync calls (or 409 for async).
 */

import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  getMerchantWallet,
  getNetwork,
  getUsdcMint,
  USDC_DECIMALS,
  verifyUsdcPayment,
  formatUsdcAtomic,
  type SolanaNetwork,
} from "@/lib/x402";
import { createServiceRoleClient } from "@/lib/supabase-server";

export const X402_VERSION = 1;

export interface PaymentRequirements {
  scheme: "exact";
  network: "solana" | "solana-devnet";
  maxAmountRequired: string;       // atomic units as string
  asset: string;                    // USDC mint
  payTo: string;                    // merchant ATA
  resource: string;                 // full URL of the resource
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface X402PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: "solana" | "solana-devnet";
  payload: {
    txSignature: string;
    asset?: string;
    amount?: string;
  };
}

export interface X402RequestContext {
  jobId: string;
  agentWallet: string;
  txSignature: string;
  network: SolanaNetwork;
  amountAtomic: bigint;
  endpoint: string;
  /** Pre-validated body when `validateBody` is configured. Handler can read
   *  this directly without re-parsing the request stream. */
  validatedBody?: unknown;
}

/** Result returned by an X402WrapperConfig.validateBody function. */
export type ValidateBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; errors: unknown };

export interface X402WrapperConfig {
  /** Human-readable description of the resource being sold (shown in 402 body). */
  description: string;
  /** Price in USDC atomic units (6 decimals). 100_000n = 0.10 USDC. */
  priceUsdcAtomic: bigint;
  /** Whether the response is async — affects idempotency cache behavior. */
  async?: boolean;
  /** Max time the agent should wait for the response. Default 60s for sync. */
  maxTimeoutSeconds?: number;
  /**
   * Optional body validator run BEFORE the 402 payment check, so an agent
   * sending an obviously invalid body gets a 422 immediately and never
   * pays for a request that will be rejected after on-chain settlement.
   *
   * Wrap your zod schema like:
   *   validateBody: (raw) => {
   *     const r = mySchema.safeParse(raw);
   *     return r.success
   *       ? { ok: true, body: r.data }
   *       : { ok: false, errors: r.error.flatten() };
   *   }
   *
   * Only runs for methods that carry a body (POST/PUT/PATCH). For GET
   * endpoints (the Scout Data API), leave this undefined.
   *
   * Validated body is passed to the handler via ctx.validatedBody so the
   * handler doesn't re-parse.
   */
  validateBody?: (rawBody: unknown) => ValidateBodyResult | Promise<ValidateBodyResult>;
}

const SOLANA_NETWORK_LABEL: Record<SolanaNetwork, "solana" | "solana-devnet"> = {
  mainnet: "solana",
  devnet: "solana-devnet",
};

function generateJobId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/**
 * Build the 402 Payment Required response body.
 * Format roughly mirrors Coinbase x402 spec; clients can decode standard fields.
 */
async function buildPaymentRequirements(
  config: X402WrapperConfig,
  resourceUrl: string,
  network: SolanaNetwork,
): Promise<PaymentRequirements> {
  const mint = getUsdcMint(network);
  const merchantPubkey = new PublicKey(getMerchantWallet());
  const merchantAta = (
    await getAssociatedTokenAddress(new PublicKey(mint), merchantPubkey)
  ).toBase58();

  return {
    scheme: "exact",
    network: SOLANA_NETWORK_LABEL[network],
    maxAmountRequired: config.priceUsdcAtomic.toString(),
    asset: mint,
    payTo: merchantAta,
    resource: resourceUrl,
    description: config.description,
    mimeType: "application/json",
    maxTimeoutSeconds: config.maxTimeoutSeconds ?? 60,
    extra: {
      name: "USDC",
      decimals: USDC_DECIMALS,
      assetOwner: merchantPubkey.toBase58(),
    },
  };
}

/** Parse and validate the X-PAYMENT header. Returns null if missing/invalid. */
function parsePaymentHeader(headerValue: string | null): X402PaymentPayload | null {
  if (!headerValue) return null;
  try {
    // Header is base64-encoded JSON per x402 spec
    const decoded = typeof atob !== "undefined"
      ? atob(headerValue)
      : Buffer.from(headerValue, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as X402PaymentPayload;
    if (parsed?.payload?.txSignature && parsed.scheme === "exact") {
      return parsed;
    }
  } catch {
    // Fallback: maybe the client sent raw JSON instead of base64
    try {
      const parsed = JSON.parse(headerValue) as X402PaymentPayload;
      if (parsed?.payload?.txSignature) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Wrap a route handler with x402 payment enforcement.
 *
 * Usage:
 *   export const GET = withX402Payment(
 *     async (req, ctx) => NextResponse.json({ data }),
 *     { description: "Scout gaps query", priceUsdcAtomic: BigInt(100000) }
 *   );
 *
 * The handler receives (request, x402Context) where x402Context contains
 * the verified jobId, agentWallet, txSignature, etc. The job row is created
 * BEFORE the handler runs, so the handler can store result via:
 *   serviceClient.from("agent_jobs").update({result, status: 'completed'})
 *     .eq('id', ctx.jobId)
 */
export function withX402Payment(
  handler: (request: Request, ctx: X402RequestContext) => Promise<Response>,
  config: X402WrapperConfig,
): (request: Request) => Promise<Response> {
  const isAsync = config.async ?? false;

  return async function x402Handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Resolve public origin behind Railway's reverse proxy. request.url's origin
    // is the internal http://localhost:3000; use NEXT_PUBLIC_SITE_URL or the
    // forwarded headers to construct the URL agents would actually call.
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    const fwdHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
    const publicOrigin =
      envUrl && envUrl.startsWith("http")
        ? envUrl
        : fwdHost
          ? `${fwdProto}://${fwdHost}`
          : url.origin;
    const resourceUrl = `${publicOrigin}${url.pathname}${url.search}`;

    // Agents can request devnet pricing/verification via ?network=devnet so they
    // can integration-test against real x402 without spending real USDC. Mainnet
    // is the default for production agent traffic.
    const networkParam = url.searchParams.get("network");
    const requestedNetwork: SolanaNetwork =
      networkParam === "devnet" ? "devnet" : networkParam === "mainnet" ? "mainnet" : getNetwork();

    const paymentHeader = request.headers.get("x-payment") ?? request.headers.get("X-PAYMENT");
    const payment = parsePaymentHeader(paymentHeader);

    // Pre-payment body validation. Run BEFORE the 402 advertisement so an
    // agent sending an obviously malformed body (wrong enum, missing field,
    // type mismatch) gets 422 immediately and can fix the call without
    // burning USDC on a request that would be rejected after on-chain
    // settlement. Skipped entirely on GET (no body) and when no validator
    // is configured.
    let validatedBody: unknown = undefined;
    const method = request.method.toUpperCase();
    const methodHasBody = method === "POST" || method === "PUT" || method === "PATCH";
    if (config.validateBody && methodHasBody) {
      let rawBody: unknown = undefined;
      try {
        // Read once and clone for downstream consumers (handler may call .json() again).
        const text = await request.clone().text();
        rawBody = text.length === 0 ? {} : JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body", code: "invalid_json" },
          { status: 400 },
        );
      }
      const result = await config.validateBody(rawBody);
      if (!result.ok) {
        return NextResponse.json(
          {
            error: "Request body failed validation",
            code: "invalid_body",
            details: result.errors,
          },
          { status: 422 },
        );
      }
      validatedBody = result.body;
    }

    // No payment → return 402 with requirements
    if (!payment) {
      const requirements = await buildPaymentRequirements(config, resourceUrl, requestedNetwork);
      return NextResponse.json(
        {
          x402Version: X402_VERSION,
          accepts: [requirements],
          error: "Payment required. Submit a Solana USDC transferChecked tx and resend with X-PAYMENT header.",
        },
        {
          status: 402,
          headers: { "x402-version": String(X402_VERSION) },
        },
      );
    }

    // Validate that payment matches the network the agent requested at probe time.
    const network = requestedNetwork;
    const expectedLabel = SOLANA_NETWORK_LABEL[network];
    if (payment.network !== expectedLabel) {
      return NextResponse.json(
        { error: `Network mismatch: expected ${expectedLabel}, got ${payment.network}. Did you forget ?network=devnet on the URL?` },
        { status: 400 },
      );
    }

    const txSignature = payment.payload.txSignature;
    const serviceClient = createServiceRoleClient();

    // Idempotency: if this tx was already processed, return cached result (sync)
    // or 409 Conflict (async — can't replay a job).
    const { data: existingJob } = await serviceClient
      .from("agent_jobs")
      .select("id, status, result, endpoint")
      .eq("tx_hash", txSignature)
      .maybeSingle();

    if (existingJob) {
      if (existingJob.endpoint !== url.pathname) {
        return NextResponse.json(
          { error: "Payment was for a different endpoint", expectedEndpoint: existingJob.endpoint },
          { status: 400 },
        );
      }
      if (isAsync) {
        return NextResponse.json(
          { error: "Transaction already processed", jobId: existingJob.id, status: existingJob.status },
          { status: 409 },
        );
      }
      // Sync replay: return the cached result if completed
      if (existingJob.status === "completed" && existingJob.result) {
        return NextResponse.json(existingJob.result, { status: 200 });
      }
      // Cached but not completed (rare — e.g., previous attempt errored mid-handler)
      // Fall through and re-execute. Idempotency still preserved since same tx_hash.
    }

    // Verify on-chain: the tx must transfer exactly the required amount of USDC
    // to our merchant ATA, with a memo binding to this resource.
    const merchantPubkey = new PublicKey(getMerchantWallet());
    const usdcMint = getUsdcMint(network);
    const merchantAta = (
      await getAssociatedTokenAddress(new PublicKey(usdcMint), merchantPubkey)
    ).toBase58();

    const verifyResult = await verifyUsdcPayment({
      txSignature,
      expectedAtomic: config.priceUsdcAtomic,
      merchantUsdcAta: merchantAta,
      expectedMint: usdcMint,
      // Memo not strictly required here — tx_hash uniqueness already prevents replay
      // and amount is bound to the price. Future: bind to request hash for stricter linking.
      network,
    });

    if (!verifyResult.verified) {
      return NextResponse.json(
        { error: verifyResult.error ?? "On-chain verification failed" },
        { status: 400 },
      );
    }

    // Insert agent_jobs row — agentWallet not directly known from on-chain verify;
    // we'd need to parse the tx for sender. For now, store empty + populate from
    // payload if available.
    const jobId = generateJobId(isAsync ? "job" : "data");
    const agentWallet = ""; // could parse from tx in future; not blocking

    const { error: insertErr } = await serviceClient.from("agent_jobs").insert({
      id: jobId,
      agent_wallet: agentWallet,
      endpoint: url.pathname,
      status: isAsync ? "pending" : "running",
      tx_hash: txSignature,
      amount_usdc_atomic: config.priceUsdcAtomic.toString(),
      network,
      started_at: isAsync ? null : new Date().toISOString(),
    });

    if (insertErr) {
      // Handle race: if another concurrent request inserted same tx_hash, prefer its result
      if (insertErr.code === "23505") {
        const { data: raceJob } = await serviceClient
          .from("agent_jobs")
          .select("id, status, result")
          .eq("tx_hash", txSignature)
          .maybeSingle();
        if (raceJob?.result) return NextResponse.json(raceJob.result, { status: 200 });
      }
      console.error("agent_jobs insert failed:", insertErr.message);
      return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
    }

    const ctx: X402RequestContext = {
      jobId,
      agentWallet,
      txSignature,
      network,
      amountAtomic: config.priceUsdcAtomic,
      endpoint: url.pathname,
      validatedBody,
    };

    try {
      const response = await handler(request, ctx);

      // For sync handlers: cache the result + mark completed
      if (!isAsync && response.ok) {
        const cloned = response.clone();
        try {
          const result = await cloned.json();
          await serviceClient
            .from("agent_jobs")
            .update({
              status: "completed",
              result,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        } catch {
          // Response wasn't JSON — skip caching but still mark completed
          await serviceClient
            .from("agent_jobs")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", jobId);
        }
      }

      // Surface jobId in response headers so client can poll/refund-trace
      const finalResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          "x-x402-job-id": jobId,
          "x-x402-tx-hash": txSignature,
        },
      });
      return finalResponse;
    } catch (err) {
      const errMsg = (err as Error).message ?? "Handler crashed";
      await serviceClient
        .from("agent_jobs")
        .update({ status: "failed", error: errMsg, completed_at: new Date().toISOString() })
        .eq("id", jobId);
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }
  };
}

/** Convenience: format USDC atomic for display in 402 body. */
export { formatUsdcAtomic };
