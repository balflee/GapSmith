"use client";

import { useState } from "react";
import Link from "next/link";
import { payWithPhantom, PaymentError, type X402Quote } from "@/lib/x402-client";

const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const ACCENT = "oklch(0.62 0.155 52)";
const PATINA = "oklch(0.62 0.13 178)";

export type ServiceConfig = {
  slug: "scout" | "forge" | "prove";
  label: string;
  price: number;
  color: string;
  turnaround: string;
  deliverable: string;
  pitch: string;
  briefFields: Array<{
    key: "brief_sectors" | "brief_idea" | "brief_target_market" | "brief_constraints" | "brief_what_you_want";
    label: string;
    placeholder: string;
    required: boolean;
    rows: number;
  }>;
};

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "stripe-redirecting" }
  | { kind: "x402-quoting" }
  | { kind: "x402-signing" }
  | { kind: "x402-verifying" }
  | { kind: "error"; message: string };

export function OrderClient({ service }: { service: ServiceConfig }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [form, setForm] = useState<Record<string, string>>({
    contact_name: "",
    contact_email: "",
    brief_sectors: "",
    brief_idea: "",
    brief_target_market: "",
    brief_constraints: "",
    brief_what_you_want: "",
  });

  const isBusy = status.kind !== "idle" && status.kind !== "error";

  function update(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function validate(): string | null {
    if (!form.contact_email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) return "Email looks invalid.";
    for (const f of service.briefFields) {
      if (f.required && !form[f.key]?.trim()) return `${f.label} is required.`;
    }
    return null;
  }

  /** Persist the form, return the new order id. */
  async function createOrder(): Promise<string> {
    const res = await fetch("/api/order/dfy/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: service.slug,
        contact_email: form.contact_email,
        contact_name: form.contact_name || undefined,
        brief_sectors: form.brief_sectors || undefined,
        brief_idea: form.brief_idea || undefined,
        brief_target_market: form.brief_target_market || undefined,
        brief_constraints: form.brief_constraints || undefined,
        brief_what_you_want: form.brief_what_you_want || undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Failed to save order");
    }
    const json = await res.json();
    return json.id as string;
  }

  async function payWithStripe() {
    const err = validate();
    if (err) return setStatus({ kind: "error", message: err });
    setStatus({ kind: "submitting" });
    try {
      const orderId = await createOrder();
      setStatus({ kind: "stripe-redirecting" });
      const res = await fetch("/api/order/dfy/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Stripe checkout failed");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function payWithUsdc() {
    const err = validate();
    if (err) return setStatus({ kind: "error", message: err });
    setStatus({ kind: "submitting" });
    try {
      const orderId = await createOrder();

      setStatus({ kind: "x402-quoting" });
      const quoteRes = await fetch("/api/order/dfy/x402", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token: "usdc" }),
      });
      if (!quoteRes.ok) {
        const err = await quoteRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Quote failed");
      }
      const quote = (await quoteRes.json()) as X402Quote & { orderId: string };

      setStatus({ kind: "x402-signing" });
      const signature = await payWithPhantom(quote);

      setStatus({ kind: "x402-verifying" });
      const verifyRes = await fetch("/api/order/dfy/x402/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: quote.paymentId, txSignature: signature }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Verification failed");
      }
      window.location.href = `/order/success?id=${orderId}&tx=${encodeURIComponent(signature)}`;
    } catch (e) {
      if (e instanceof PaymentError && e.code === "USER_REJECTED") {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const statusLabel: Record<Status["kind"], string> = {
    idle: "",
    submitting: "Saving your brief…",
    "stripe-redirecting": "Redirecting to Stripe…",
    "x402-quoting": "Building Solana payment…",
    "x402-signing": "Approve in your wallet…",
    "x402-verifying": "Verifying on-chain…",
    error: "",
  };

  return (
    <div className="min-h-screen px-6 py-12 lg:py-16" style={{ background: "oklch(0.98 0.008 85)" }}>
      <div className="mx-auto max-w-3xl">
        {/* Back link */}
        <Link href="/pricing" className="text-xs" style={{ color: MUTED }}>
          ← Back to Pricing
        </Link>

        {/* Hero */}
        <div className="mt-3 mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: ACCENT }}>
              Done-For-You · Premium
            </div>
            <h1
              className="mt-1 font-heading text-4xl font-bold tracking-tight md:text-5xl"
              style={{ color: FG, letterSpacing: "-1.5px", lineHeight: 1.1 }}
            >
              Order {service.label}
            </h1>
            <p className="mt-3 max-w-xl text-sm" style={{ color: MUTED, lineHeight: 1.6 }}>
              {service.pitch}
            </p>
          </div>
          <div
            className="rounded-xl p-4 text-right"
            style={{ background: "white", boxShadow: `0 0 0 1px ${BORDER}` }}
          >
            <div className="font-heading text-3xl font-bold" style={{ color: service.color }}>
              ${service.price}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>per run</div>
            <div className="mt-2 text-xs" style={{ color: FG }}>
              {service.turnaround}
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => e.preventDefault()}
          className="rounded-xl p-6"
          style={{ background: "white", boxShadow: `0 0 0 1px ${BORDER}, 0 4px 24px -8px rgba(0,0,0,0.06)` }}
        >
          <h2 className="font-heading text-lg font-bold" style={{ color: FG }}>1. Your contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              hint="So we know who's asking"
              value={form.contact_name}
              onChange={(v) => update("contact_name", v)}
              placeholder="Lee, Aisha, …"
            />
            <Field
              label="Email"
              required
              type="email"
              hint="We send the report here"
              value={form.contact_email}
              onChange={(v) => update("contact_email", v)}
              placeholder="you@example.com"
            />
          </div>

          <h2 className="mt-8 font-heading text-lg font-bold" style={{ color: FG }}>2. The brief</h2>
          <p className="mt-1 text-xs" style={{ color: MUTED }}>
            The more focused, the sharper our output. 150-300 words is plenty.
          </p>
          <div className="mt-4 space-y-4">
            {service.briefFields.map((f) => (
              <Textarea
                key={f.key}
                label={f.label}
                placeholder={f.placeholder}
                required={f.required}
                rows={f.rows}
                value={form[f.key]}
                onChange={(v) => update(f.key, v)}
              />
            ))}
          </div>

          <h2 className="mt-8 font-heading text-lg font-bold" style={{ color: FG }}>3. Pay</h2>
          <p className="mt-1 text-xs" style={{ color: MUTED }}>
            Pay with USDC on Solana (instant, irreversible) or with a card via Stripe. We start the work as soon as payment confirms.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={payWithUsdc}
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: PATINA,
                color: "white",
                boxShadow: `0 2px 12px oklch(0.62 0.13 178 / 0.30)`,
              }}
            >
              <span>◎</span>
              Pay {service.price} USDC via Solana
            </button>
            <button
              type="button"
              onClick={payWithStripe}
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: "white",
                color: FG,
                boxShadow: `inset 0 0 0 1px ${BORDER}`,
              }}
            >
              Pay ${service.price} with card
            </button>
          </div>

          {/* Status + error */}
          <div className="mt-4 min-h-[1.25rem] text-xs" aria-live="polite">
            {status.kind === "error" ? (
              <span style={{ color: "oklch(0.55 0.20 25)" }}>⚠ {status.message}</span>
            ) : (
              statusLabel[status.kind] && <span style={{ color: MUTED }}>{statusLabel[status.kind]}</span>
            )}
          </div>
        </form>

        {/* What you get */}
        <div
          className="mt-8 rounded-xl p-5"
          style={{
            background: `oklch(from ${service.color} l c h / 0.06)`,
            boxShadow: `inset 0 0 0 1px oklch(from ${service.color} l c h / 0.20)`,
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: service.color }}>
            What you receive
          </div>
          <p className="mt-1 text-sm" style={{ color: FG, lineHeight: 1.55 }}>
            {service.deliverable}
          </p>
          <p className="mt-2 text-xs" style={{ color: MUTED, lineHeight: 1.5 }}>
            Top-tier LLM stack (Claude Opus 4.7 / GPT-5.5 Pro) with reviewer-in-the-loop checkpoints. See <Link href="/docs/done-for-you" className="underline" style={{ color: ACCENT }}>full process</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, required, type = "text", hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string; hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold" style={{ color: FG }}>
        {label} {required && <span style={{ color: "oklch(0.55 0.20 25)" }}>*</span>}
      </span>
      {hint && <span className="ml-2 text-[11px]" style={{ color: MUTED }}>{hint}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1.5 block w-full rounded-md px-3 py-2 text-sm outline-none transition-shadow focus:ring-2"
        style={{
          background: "oklch(0.98 0.005 80)",
          color: FG,
          boxShadow: `inset 0 0 0 1px ${BORDER}`,
        }}
      />
    </label>
  );
}

function Textarea({
  label, value, onChange, placeholder, required, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold" style={{ color: FG }}>
        {label} {required && <span style={{ color: "oklch(0.55 0.20 25)" }}>*</span>}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        rows={rows}
        className="mt-1.5 block w-full rounded-md px-3 py-2 text-sm outline-none transition-shadow focus:ring-2"
        style={{
          background: "oklch(0.98 0.005 80)",
          color: FG,
          boxShadow: `inset 0 0 0 1px ${BORDER}`,
          resize: "vertical",
        }}
      />
    </label>
  );
}
