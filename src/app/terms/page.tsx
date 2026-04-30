import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — GapSmith",
  description: "GapSmith Terms of Service: lifetime access scope, refund policy, service termination, payment terms.",
};

const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const ACCENT = "oklch(0.62 0.155 52)";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mt-10 font-heading text-2xl font-bold tracking-tight"
      style={{ color: FG, letterSpacing: "-1px" }}
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mt-6 font-heading text-lg font-bold"
      style={{ color: FG }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-sm" style={{ color: FG, lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm" style={{ color: FG, lineHeight: 1.65 }}>
      {children}
    </ul>
  );
}

export default function TermsPage() {
  const lastUpdated = "2026-04-28";
  return (
    <div className="min-h-screen px-6 py-12" style={{ background: "oklch(0.98 0.008 85)" }}>
      <div className="mx-auto max-w-3xl">
        {/* Back nav */}
        <Link href="/pricing" className="inline-flex items-center gap-1 text-xs" style={{ color: MUTED }}>
          ← Back to Pricing
        </Link>

        <h1
          className="mt-4 font-heading text-4xl font-bold tracking-tight md:text-5xl"
          style={{ color: FG, letterSpacing: "-1.5px" }}
        >
          Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-sm" style={{ color: MUTED }}>
          Last updated: {lastUpdated}
        </p>

        <div
          className="mt-8 rounded-lg p-4"
          style={{
            background: `oklch(from ${ACCENT} l c h / 0.06)`,
            boxShadow: `inset 0 0 0 1px oklch(from ${ACCENT} l c h / 0.2)`,
          }}
        >
          <p className="text-sm" style={{ color: FG, lineHeight: 1.65 }}>
            <strong>Plain-English summary:</strong> When we say &ldquo;lifetime,&rdquo; we mean the
            operating lifetime of GapSmith — not yours. If we ever shut the service down,
            we&apos;ll give you at least 6 months&apos; notice and refund any unused portion
            of your annual usage quota. Your one-time payment locks in your tier price for
            as long as the service runs.
          </p>
        </div>

        {/* 1. Definitions */}
        <H2>1. Definitions</H2>
        <UL>
          <li>
            <strong>&ldquo;Service&rdquo;</strong> means the GapSmith platform at{" "}
            <Link href="/" className="underline" style={{ color: ACCENT }}>
              gapsmith.draftlabs.org
            </Link>
            , including its Scout, Forge, Prove pipelines, the Agent API at{" "}
            <Link href="/docs/api" className="underline" style={{ color: ACCENT }}>
              /docs/api
            </Link>
            , and any associated CLI tools.
          </li>
          <li>
            <strong>&ldquo;Lifetime Access&rdquo;</strong> means access for the duration the
            Service continues to operate, subject to this agreement.
          </li>
          <li>
            <strong>&ldquo;Annual Quota&rdquo;</strong> means the per-product usage allowance
            (e.g. &ldquo;12 Scout runs per year&rdquo;) that resets on each 365-day rolling
            cycle from the date of your purchase.
          </li>
          <li>
            <strong>&ldquo;Done-For-You Service&rdquo;</strong> means our premium pay-per-run
            offering ($39 / $99 / $149) where we operate the pipeline on your behalf using
            top-tier LLMs and human review.
          </li>
        </UL>

        {/* 2. What you're buying */}
        <H2>2. What &ldquo;Lifetime&rdquo; Means</H2>
        <P>
          When you purchase a lifetime tier (Scout, Forge, Prove, Bundle, or CLI), you receive
          access to that product for as long as the Service operates, with the following
          terms:
        </P>
        <UL>
          <li>
            Your <strong>price tier is locked</strong> — even as the bonding curve raises
            prices for new buyers, your purchase price remains valid for renewals of your
            quota cycle.
          </li>
          <li>
            Your access includes the <strong>annual usage quota</strong> snapshotted at
            purchase time, refreshing every 365 days from your purchase date.
          </li>
          <li>
            Quota exhaustion does not extend the Annual Quota. To run beyond it, please use
            the Done-For-You Service or wait for the next cycle.
          </li>
          <li>
            &ldquo;Lifetime&rdquo; refers to <strong>the lifetime of the Service</strong>, not
            the natural lifetime of the purchaser. We do not commit to operating the Service
            in perpetuity.
          </li>
        </UL>

        {/* 3. Service termination */}
        <H2>3. Service Continuity &amp; Termination</H2>
        <P>
          We reserve the right to discontinue, materially alter, or sell the Service. If we
          discontinue or materially impair access:
        </P>
        <UL>
          <li>
            We will provide <strong>at least 6 months&apos; advance written notice</strong>{" "}
            (via the email associated with your account) before any shutdown.
          </li>
          <li>
            We will issue a <strong>pro-rata refund</strong> based on the unused portion of
            your most recent Annual Quota cycle. Example: if you&apos;ve used 6 of 12 Scout
            runs and the service shuts down, you&apos;ll receive 50% of your purchase price.
          </li>
          <li>
            Refunds are issued via the original payment method (Stripe charge reversal for
            credit cards; on-chain USDC transfer for x402 payments).
          </li>
          <li>
            Materials you&apos;ve generated using the Service (Scout reports, Forge ideas,
            Prove debates) remain yours and we&apos;ll provide an export option before
            shutdown.
          </li>
        </UL>

        {/* 4. Refunds outside termination */}
        <H2>4. Other Refunds</H2>
        <P>
          Outside of Service-termination scenarios, purchases are <strong>final and
          non-refundable</strong>. Exceptions:
        </P>
        <UL>
          <li>
            <strong>Failed Done-For-You runs</strong> (technical errors, not subjective
            satisfaction): we&apos;ll either re-run the request at no cost or refund.
          </li>
          <li>
            <strong>Failed Compute API jobs</strong> (jobs marked <code>failed</code> in
            agent_jobs): full automated USDC refund within 14 days.
          </li>
          <li>
            <strong>Duplicate / accidental purchases</strong>: contact us within 7 days.
          </li>
        </UL>

        {/* 5. x402 payment specifics */}
        <H2>5. Cryptocurrency Payment Terms (x402 / USDC)</H2>
        <UL>
          <li>
            x402 payments are settled on the Solana blockchain in USDC. The transaction is{" "}
            <strong>final and irreversible</strong> once confirmed on-chain.
          </li>
          <li>
            We make no representations regarding USDC&apos;s value vs. fiat currency. If
            USDC depegs or our merchant USDC account is compromised, refunds (where due)
            will be issued in equivalent USD via Stripe or alternative arrangement.
          </li>
          <li>
            Payment confirmation requires the transaction memo to bind to the requested
            resource. We are not liable for funds sent without a valid memo or to incorrect
            addresses.
          </li>
          <li>
            For autonomous AI agent calls via x402, the agent operator is responsible for
            ensuring the calling wallet has sufficient USDC + SOL gas before initiating
            requests.
          </li>
        </UL>

        {/* 6. Agent API */}
        <H2>6. Agent API Use</H2>
        <UL>
          <li>
            The Agent API (
            <Link href="/docs/api" className="underline" style={{ color: ACCENT }}>
              /docs/api
            </Link>
            ) is callable by automated agents. Each call must include valid x402 payment
            proof.
          </li>
          <li>
            We provide <strong>no SLA guarantees</strong> for synchronous endpoints (Data
            API). Async Compute API jobs have a target completion window of 60 minutes; jobs
            running longer may be auto-failed and refunded.
          </li>
          <li>
            You may cache and reuse data returned by the Data API for your application&apos;s
            internal use. <strong>Bulk redistribution or resale</strong> of GapSmith
            intelligence as a competing product is prohibited.
          </li>
        </UL>

        {/* 7. Acceptable use */}
        <H2>7. Acceptable Use</H2>
        <P>You agree not to:</P>
        <UL>
          <li>Reverse-engineer the Service to bypass payment</li>
          <li>Submit prompts intended to extract proprietary system prompts or generate harmful content</li>
          <li>Resell access or share account credentials</li>
          <li>Use the Service for activities prohibited under applicable law</li>
        </UL>

        {/* 8. Liability */}
        <H2>8. Limitation of Liability</H2>
        <P>
          The Service is provided &ldquo;as is&rdquo; without warranties of any kind. We are
          not liable for indirect, consequential, or punitive damages, including lost profits
          or business decisions made based on Service output. Our total liability for any
          claim is limited to the amount you paid us in the 12 months preceding the claim.
        </P>

        {/* 9. Changes to terms */}
        <H2>9. Changes to These Terms</H2>
        <P>
          We may update these Terms from time to time. <strong>Material changes</strong>{" "}
          (such as changes to the lifetime/quota structure or refund policy) will be
          announced 30 days in advance via email and pinned on this page. Continued use after
          the effective date constitutes acceptance.
        </P>

        {/* 10. Contact */}
        <H2>10. Contact</H2>
        <P>
          Questions, refund requests, or other concerns:{" "}
          <a
            href="mailto:gapsmith@draftlabs.org"
            className="underline"
            style={{ color: ACCENT }}
          >
            gapsmith@draftlabs.org
          </a>
          . We&apos;ll acknowledge within 3 business days.
        </P>

        {/* Footer */}
        <div className="mt-16 border-t pt-8 text-xs" style={{ borderColor: BORDER, color: MUTED }}>
          <p>
            <Link href="/" className="underline">← Back to home</Link>
            {" · "}
            <Link href="/pricing" className="underline">Pricing</Link>
            {" · "}
            <Link href="/docs/api" className="underline">API docs</Link>
          </p>
          <p className="mt-2" style={{ opacity: 0.7 }}>
            Last updated {lastUpdated}.
          </p>
        </div>
      </div>
    </div>
  );
}
