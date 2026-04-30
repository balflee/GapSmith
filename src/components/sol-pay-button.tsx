"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { payWithPhantom, PaymentError, type X402Quote } from "@/lib/x402-client";

/* Solana ecosystem accent — translated into the Workshop palette.
   Token names preserved so existing `${SOLANA_PURPLE}40` hex-alpha patterns
   still produce valid CSS; values are the brand's Patina (teal) and Ember (orange) hex. */
const SOLANA_PURPLE = "#3db5a6"; // Patina
const SOLANA_GREEN = "#d4743c";  // Ember
const SOLANA_GRADIENT = `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`;

type Status =
  | { kind: "idle" }
  | { kind: "quoting" }
  | { kind: "ready"; quote: X402Quote }
  | { kind: "signing"; quote: X402Quote }
  | { kind: "verifying"; quote: X402Quote; signature: string }
  | { kind: "success"; signature: string; network: "devnet" | "mainnet" }
  | { kind: "error"; message: string; code?: string };

interface SolPayButtonProps {
  /** SKU to purchase. Required. */
  sku: "scout" | "forge" | "prove" | "bundle" | "cli";
  /** Whether the user is logged in. If false, button links to /signup. */
  isLoggedIn: boolean;
  /** Whether the user already owns this SKU (or owns bundle/cli that grants it). */
  isOwned: boolean;
  /** Display amount in USDC (e.g. "4.90") — shown in the button label */
  priceUsdc?: string;
  /** Visual variant. "primary" = filled Solana gradient (main CTA). "outline" = bordered (secondary). */
  variant?: "primary" | "outline";
}

function SolanaLogo({ size = 12 }: { size?: number }) {
  const h = (size / 12) * 10;
  return (
    <svg width={size} height={h} viewBox="0 0 508 456" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M81.3 378.2c3-3 7-4.7 11.3-4.7h404.2c7.1 0 10.7 8.6 5.7 13.6l-79 79c-3 3-7 4.7-11.3 4.7H8c-7.1 0-10.7-8.6-5.7-13.6l79-79z" fill={SOLANA_GREEN} />
      <path d="M81.3 4.7C84.4 1.7 88.4 0 92.6 0h404.2c7.1 0 10.7 8.6 5.7 13.6l-79 79c-3 3-7 4.7-11.3 4.7H8C.9 97.3-2.7 88.7 2.3 83.7l79-79z" fill={SOLANA_GREEN} />
      <path d="M423.5 190.6c-3-3-7-4.7-11.3-4.7H8c-7.1 0-10.7 8.6-5.7 13.6l79 79c3 3 7 4.7 11.3 4.7h404.2c7.1 0 10.7-8.6 5.7-13.6l-79-79z" fill={SOLANA_GREEN} />
    </svg>
  );
}

export function SolPayButton({
  sku,
  isLoggedIn,
  isOwned,
  priceUsdc,
  variant = "outline",
}: SolPayButtonProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const isPrimary = variant === "primary";

  // After successful payment: show success state for ~2.5s (so user sees the
  // "Settled via x402 — view tx" badge), then full reload so /api/pricing and
  // /api/access/check both re-fetch — this updates the slot counter and flips
  // this card (and any related ones via bundle/CLI) from "Get" to "Open".
  useEffect(() => {
    if (status.kind !== "success") return;
    const timer = setTimeout(() => {
      window.location.reload();
    }, 2500);
    return () => clearTimeout(timer);
  }, [status.kind]);

  // Already owns it — no Pay-with-SOL button needed
  if (isOwned) return null;

  // Not logged in — prompt to signup
  if (!isLoggedIn) {
    return (
      <Link
        href={`/signup?next=/pricing&sku=${sku}`}
        className={`flex w-full items-center justify-center gap-2 rounded-full text-center transition-all duration-200 ${
          isPrimary ? "mt-6 py-3 text-base font-bold" : "mt-2 py-2.5 text-sm font-semibold"
        }`}
        style={
          isPrimary
            ? {
                background: SOLANA_GRADIENT,
                color: "#0a0a0a",
                boxShadow: `0 4px 16px ${SOLANA_PURPLE}40, 0 0 0 1px ${SOLANA_PURPLE}50`,
                fontWeight: 700,
              }
            : { background: "transparent", boxShadow: `0 0 0 1px ${SOLANA_PURPLE}50` }
        }
      >
        <SolanaLogo size={isPrimary ? 14 : 12} />
        {isPrimary ? (
          <span style={{ color: "#0a0a0a", fontWeight: 700 }}>Sign up to Pay with USDC</span>
        ) : (
          <span style={{ background: SOLANA_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Sign up to Pay with USDC
          </span>
        )}
      </Link>
    );
  }

  async function handlePay() {
    setStatus({ kind: "quoting" });
    try {
      // 1. Get quote from server (snaps current bonding-curve price)
      const quoteResp = await fetch("/api/checkout/x402", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: sku, token: "usdc" }),
      });
      if (!quoteResp.ok) {
        const err = await quoteResp.json().catch(() => ({}));
        throw new Error(err.error || `Quote failed (HTTP ${quoteResp.status})`);
      }
      const quote = (await quoteResp.json()) as X402Quote;
      setStatus({ kind: "ready", quote });

      // 2. Phantom signs + sends
      setStatus({ kind: "signing", quote });
      const signature = await payWithPhantom(quote);

      // 3. Server verifies on-chain
      setStatus({ kind: "verifying", quote, signature });
      const verifyResp = await fetch("/api/checkout/x402/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: quote.paymentId, txSignature: signature }),
      });
      if (!verifyResp.ok) {
        const err = await verifyResp.json().catch(() => ({}));
        throw new Error(err.error || `Verify failed (HTTP ${verifyResp.status})`);
      }

      setStatus({ kind: "success", signature, network: quote.network });
      // useEffect on status will window.location.reload() after ~2.5s
    } catch (err) {
      if (err instanceof PaymentError) {
        // Surface real Phantom error message for TX_FAILED so user can act on it.
        // Map specific codes to clearer language; otherwise pass through.
        const codeLabel: Partial<Record<string, string>> = {
          PHANTOM_NOT_INSTALLED: "Phantom wallet not detected. Install at phantom.app",
          USER_REJECTED: "Cancelled in wallet",
          INSUFFICIENT_USDC: "Not enough USDC in your Phantom wallet",
          INSUFFICIENT_SOL_GAS: err.message, // already includes faucet URL
          UNSUPPORTED_TOKEN: "Internal error: unsupported token",
          MISSING_FIELDS: "Internal error: incomplete quote",
        };
        const message = codeLabel[err.code] ?? err.message ?? "Transaction failed";
        setStatus({ kind: "error", message, code: err.code });
      } else {
        setStatus({ kind: "error", message: (err as Error).message });
      }
    }
  }

  const busy =
    status.kind === "quoting" ||
    status.kind === "ready" ||
    status.kind === "signing" ||
    status.kind === "verifying";

  const label = (() => {
    switch (status.kind) {
      case "quoting":
        return "Getting quote…";
      case "ready":
      case "signing":
        return "Awaiting wallet…";
      case "verifying":
        return "Confirming on-chain…";
      case "success":
        return "Unlocked ✓";
      default:
        return priceUsdc ? `Pay ${priceUsdc} USDC` : "Pay with USDC";
    }
  })();

  // Primary = filled Solana gradient (main CTA, large)
  // Outline = bordered transparent (secondary)
  const buttonStyle: React.CSSProperties = isPrimary
    ? {
        background: SOLANA_GRADIENT,
        color: "#0a0a0a",
        boxShadow: `0 4px 16px ${SOLANA_PURPLE}40, 0 0 0 1px ${SOLANA_PURPLE}50`,
        fontWeight: 700,
      }
    : {
        background: "transparent",
        boxShadow: `0 0 0 1px ${SOLANA_PURPLE}50`,
      };

  return (
    <div>
      <button
        type="button"
        onClick={handlePay}
        disabled={busy || status.kind === "success"}
        className={`flex w-full items-center justify-center gap-2 rounded-full text-center transition-all duration-200 disabled:opacity-60 disabled:cursor-wait ${
          isPrimary ? "mt-6 py-3 text-base font-bold" : "mt-2 py-2.5 text-sm font-semibold"
        }`}
        style={buttonStyle}
        onMouseEnter={(e) => {
          if (busy) return;
          if (isPrimary) {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = `0 6px 24px ${SOLANA_PURPLE}55, 0 0 0 1px ${SOLANA_PURPLE}80`;
          } else {
            e.currentTarget.style.boxShadow = `0 0 0 1px ${SOLANA_PURPLE}90, 0 0 16px ${SOLANA_PURPLE}25`;
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "";
          if (isPrimary) {
            e.currentTarget.style.boxShadow = `0 4px 16px ${SOLANA_PURPLE}40, 0 0 0 1px ${SOLANA_PURPLE}50`;
          } else {
            e.currentTarget.style.boxShadow = `0 0 0 1px ${SOLANA_PURPLE}50`;
          }
        }}
      >
        <SolanaLogo size={isPrimary ? 14 : 12} />
        {isPrimary ? (
          <span style={{ color: "#0a0a0a", fontWeight: 700 }}>{label}</span>
        ) : (
          <span style={{ background: SOLANA_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {label}
          </span>
        )}
      </button>
      {isPrimary && status.kind !== "success" && status.kind !== "error" && (
        <div className="mt-1.5 text-center text-[11px]" style={{ color: SOLANA_PURPLE, opacity: 0.85 }}>
          ✨ Powered by x402 on Solana
        </div>
      )}
      {status.kind === "error" && (
        <div className="mt-2 text-xs" style={{ color: "oklch(0.55 0.2 25)" }}>
          {status.message}
          {status.code === "PHANTOM_NOT_INSTALLED" && (
            <>
              {" "}
              <a
                href="https://phantom.app/download"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Install Phantom
              </a>
            </>
          )}
          {status.code === "INSUFFICIENT_SOL_GAS" && (
            <>
              {" "}
              <a
                href="https://faucet.solana.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Devnet SOL faucet ↗
              </a>
            </>
          )}
        </div>
      )}
      {status.kind === "success" && (
        <div className="mt-2 text-xs" style={{ color: "oklch(0.45 0.02 65)" }}>
          Settled via{" "}
          <span style={{ color: SOLANA_PURPLE, fontWeight: 600 }}>x402</span> protocol —{" "}
          <a
            href={`https://solscan.io/tx/${status.signature}${status.network === "devnet" ? "?cluster=devnet" : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            view tx ↗
          </a>
        </div>
      )}
    </div>
  );
}
