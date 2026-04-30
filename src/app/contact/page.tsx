import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — GapSmith",
  description: "Get in touch with the GapSmith team. Support, partnerships, security disclosures, refund requests.",
};

const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const ACCENT = "oklch(0.62 0.155 52)";
const PATINA = "oklch(0.62 0.13 178)";

const SUPPORT_EMAIL = "gapsmith@draftlabs.org";

function ContactCard({
  badge,
  badgeColor,
  title,
  description,
  cta,
  href,
  external,
}: {
  badge: string;
  badgeColor: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group block rounded-xl p-5 transition-all hover:translate-y-[-1px]"
      style={{
        background: "white",
        boxShadow: `0 0 0 1px ${BORDER}, 0 1px 2px rgba(0,0,0,0.02)`,
      }}
    >
      <span
        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ background: `${badgeColor}1a`, color: badgeColor }}
      >
        {badge}
      </span>
      <h3 className="mt-3 font-heading text-base font-bold" style={{ color: FG, letterSpacing: "-0.3px" }}>
        {title}
      </h3>
      <p className="mt-1.5 text-sm" style={{ color: MUTED, lineHeight: 1.55 }}>
        {description}
      </p>
      <div
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium transition-transform group-hover:translate-x-0.5"
        style={{ color: ACCENT }}
      >
        {cta} <span aria-hidden>→</span>
      </div>
    </Link>
  );
}

export default function ContactPage() {
  return (
    <div className="min-h-screen px-6 py-12 lg:py-16" style={{ background: "oklch(0.98 0.008 85)" }}>
      <div className="mx-auto max-w-3xl">
        {/* Eyebrow */}
        <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
          style={{
            background: "oklch(0.96 0.018 178)",
            boxShadow: `0 0 0 1px ${PATINA} / 0.30, inset 0 0 0 1px oklch(0.62 0.13 178 / 0.20)`,
          }}>
          <span style={{ color: PATINA }}>
            Get in touch
          </span>
        </div>

        <h1
          className="font-heading text-4xl font-bold tracking-tight md:text-5xl"
          style={{ color: FG, letterSpacing: "-1.5px", lineHeight: 1.1 }}
        >
          Talk to us.
        </h1>
        <p className="mt-4 text-base" style={{ color: MUTED, lineHeight: 1.65 }}>
          We&apos;re a small team — your message lands directly in a founder&apos;s inbox, not
          a support queue. We respond within <strong>3 business days</strong>, usually
          faster.
        </p>

        {/* Primary contact card */}
        <div
          className="mt-10 rounded-xl p-6"
          style={{
            background: "white",
            boxShadow: `0 0 0 1px ${BORDER}, 0 4px 24px -8px rgba(0,0,0,0.08)`,
          }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                Email
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-1 inline-block font-heading text-2xl font-bold hover:underline"
                style={{ color: FG, letterSpacing: "-0.5px" }}
              >
                {SUPPORT_EMAIL}
              </a>
              <p className="mt-2 text-sm" style={{ color: MUTED }}>
                Routed via Cloudflare to a real human. Use this for anything not better
                handled on GitHub.
              </p>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-transform hover:translate-y-[-1px]"
              style={{
                background: ACCENT,
                color: "white",
                boxShadow: "0 2px 12px oklch(0.62 0.155 52 / 0.25)",
              }}
            >
              Send email →
            </a>
          </div>
        </div>

        {/* Pick the right channel */}
        <h2
          className="mt-14 mb-2 font-heading text-2xl font-bold tracking-tight"
          style={{ color: FG, letterSpacing: "-1px" }}
        >
          Pick the right channel
        </h2>
        <p className="text-sm" style={{ color: MUTED, lineHeight: 1.6 }}>
          Different threads land best in different places. Quick triage:
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ContactCard
            badge="Bugs"
            badgeColor="#ef4444"
            title="Found a bug?"
            description="Email us with steps to reproduce. Include any session id and the rough timestamp — that's all we need to repro fast."
            cta={`Email ${SUPPORT_EMAIL}`}
            href={`mailto:${SUPPORT_EMAIL}?subject=Bug%20report`}
          />
          <ContactCard
            badge="Refunds"
            badgeColor={ACCENT}
            title="Refund request"
            description="Failed Done-For-You runs and failed Compute API jobs are auto-refundable per the Terms. Email us."
            cta={`Email ${SUPPORT_EMAIL}`}
            href={`mailto:${SUPPORT_EMAIL}?subject=Refund%20request`}
          />
          <ContactCard
            badge="Partnerships"
            badgeColor="#3b82f6"
            title="Build with us"
            description="Integrating GapSmith into your agent? Building on top of the x402 layer? We're easy to work with."
            cta="Email partnerships"
            href={`mailto:${SUPPORT_EMAIL}?subject=Partnership`}
          />
          <ContactCard
            badge="Security"
            badgeColor="#10b981"
            title="Security disclosure"
            description="Found a vulnerability? Email us with [SECURITY] in the subject. We respond same-day during the hackathon and within 48h after."
            cta="Email security"
            href={`mailto:${SUPPORT_EMAIL}?subject=%5BSECURITY%5D%20`}
          />
        </div>

        {/* Hackathon block */}
        <div
          className="mt-14 rounded-xl p-5"
          style={{
            background: "oklch(0.96 0.018 178)",
            boxShadow: `inset 0 0 0 1px oklch(0.62 0.13 178 / 0.25)`,
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PATINA }}>
            For Colosseum judges
          </div>
          <h3 className="mt-1 font-heading text-lg font-bold" style={{ color: FG }}>
            Want a live walkthrough?
          </h3>
          <p className="mt-1.5 text-sm" style={{ color: FG, lineHeight: 1.55 }}>
            We&apos;ll happily do a 15-minute call — show you Scout/Forge/Prove running
            end-to-end, walk through the x402 verify route, answer anything. Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Colosseum%20walkthrough`} className="underline" style={{ color: ACCENT }}>
              {SUPPORT_EMAIL}
            </a>{" "}
            with your timezone.
          </p>
        </div>

        {/* About the team */}
        <h2
          className="mt-14 mb-2 font-heading text-2xl font-bold tracking-tight"
          style={{ color: FG, letterSpacing: "-1px" }}
        >
          About us
        </h2>
        <p className="mt-2 text-sm" style={{ color: FG, lineHeight: 1.65 }}>
          GapSmith is built by a small, lean team — $10K MVP budget, AI-assisted
          development end-to-end. The product itself is the AI venture builder where AI
          agents pay AI agents on Solana.
        </p>

        {/* Quick links footer */}
        <div
          className="mt-12 rounded-lg p-4 text-xs"
          style={{ background: "white", boxShadow: `inset 0 0 0 1px ${BORDER}`, color: MUTED }}
        >
          Looking for something else?{" "}
          <Link href="/docs" className="underline" style={{ color: FG }}>Docs</Link>
          {" · "}
          <Link href="/pricing" className="underline" style={{ color: FG }}>Pricing</Link>
          {" · "}
          <Link href="/terms" className="underline" style={{ color: FG }}>Terms</Link>
          {" · "}
          <Link href="/docs/api" className="underline" style={{ color: FG }}>Agent API</Link>
        </div>
      </div>
    </div>
  );
}
