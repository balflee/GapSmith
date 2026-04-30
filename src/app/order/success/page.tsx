import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order received — GapSmith",
  description: "Your Done-For-You order is in the queue. We'll be in touch within 24-72 hours.",
};

const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const ACCENT = "oklch(0.62 0.155 52)";
const PATINA = "oklch(0.62 0.13 178)";

export default async function OrderSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; tx?: string; session?: string }>;
}) {
  const sp = await searchParams;
  const orderId = sp.id?.slice(0, 36); // UUID length cap
  const tx = sp.tx?.slice(0, 200);

  return (
    <div className="min-h-screen px-6 py-16 lg:py-24" style={{ background: "oklch(0.98 0.008 85)" }}>
      <div className="mx-auto max-w-xl">
        {/* Big checkmark */}
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `oklch(from ${PATINA} l c h / 0.12)` }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12l4 4 10-10" stroke={PATINA} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="font-heading text-4xl font-bold tracking-tight md:text-5xl" style={{ color: FG, letterSpacing: "-1.5px", lineHeight: 1.1 }}>
          We&apos;ve got it.
        </h1>
        <p className="mt-4 text-base" style={{ color: MUTED, lineHeight: 1.65 }}>
          Your order is in the queue. We&apos;ll start reviewing your brief within the next
          business day, and email you when the report ships — typically <strong>24-72 hours</strong>.
        </p>

        {/* Receipt block */}
        <div
          className="mt-8 rounded-xl p-5"
          style={{ background: "white", boxShadow: `0 0 0 1px ${BORDER}, 0 4px 24px -8px rgba(0,0,0,0.06)` }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Order receipt</div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" style={{ color: FG }}>
            {orderId && (
              <>
                <dt style={{ color: MUTED }}>Order ID</dt>
                <dd className="font-mono text-xs">{orderId}</dd>
              </>
            )}
            {tx && (
              <>
                <dt style={{ color: MUTED }}>Solana tx</dt>
                <dd className="break-all">
                  <a
                    href={`https://solscan.io/tx/${tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-mono text-xs"
                    style={{ color: PATINA }}
                  >
                    {tx.slice(0, 16)}…{tx.slice(-8)}
                  </a>
                </dd>
              </>
            )}
            <dt style={{ color: MUTED }}>Status</dt>
            <dd>
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: `oklch(from ${PATINA} l c h / 0.12)`, color: PATINA }}
              >
                In queue
              </span>
            </dd>
          </dl>
        </div>

        {/* What happens next */}
        <h2 className="mt-12 mb-3 font-heading text-xl font-bold" style={{ color: FG, letterSpacing: "-0.5px" }}>
          What happens next
        </h2>
        <ol className="space-y-3 text-sm" style={{ color: FG, lineHeight: 1.55 }}>
          {[
            { title: "Reviewer reads your brief", body: "A human on our team reads through your brief and confirms scope (or replies if anything looks ambiguous)." },
            { title: "Pipeline runs on top-tier LLM", body: "We dispatch the run on Claude Opus 4.7 / GPT-5.5 Pro via our internal CLI, with reviewer checkpoints between rounds." },
            { title: "Human review pass", body: "Every cited URL gets opened, every hard stat gets fact-checked, and the final document is rewritten for clarity." },
            { title: "Delivery to your inbox", body: "PDF + interactive web view. Reply to the delivery email and you're talking to the same human who reviewed it." },
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: `oklch(from ${ACCENT} l c h / 0.10)`, color: ACCENT }}
              >
                {i + 1}
              </span>
              <div>
                <div className="font-semibold" style={{ color: FG }}>{step.title}</div>
                <div style={{ color: MUTED }}>{step.body}</div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-lg px-5 py-2.5 text-sm font-semibold"
            style={{ background: ACCENT, color: "white" }}
          >
            Back to GapSmith
          </Link>
          <Link
            href="/contact"
            className="rounded-lg px-5 py-2.5 text-sm font-medium"
            style={{ background: "white", color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
          >
            Need to add notes? Contact us
          </Link>
        </div>
      </div>
    </div>
  );
}
