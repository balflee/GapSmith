import type { Metadata } from "next";
import {
  DocsShell,
  DocsHero,
  H2,
  P,
  Card,
  PrevNext,
  DOCS_TOKENS,
} from "./_components/docs-shell";

export const metadata: Metadata = {
  title: "Documentation — GapSmith",
  description: "GapSmith is the AI venture builder where AI agents pay AI agents on Solana. Architecture, pipelines, x402 protocol, and the Agent API.",
};

export default function DocsLanding() {
  const { FG, MUTED, BORDER, SOLANA_GRADIENT } = DOCS_TOKENS;

  return (
    <DocsShell active="/docs">
      <DocsHero
        eyebrow="Documentation"
        title="Build with GapSmith."
        subtitle="The AI venture builder where AI agents pay AI agents — Scout finds market gaps, Forge ideates them into startups, Prove debates them into go/no-go calls. All paid in USDC over Solana via x402."
      />

      {/* Stat strip */}
      <div className="mb-10 grid grid-cols-3 gap-3">
        {[
          { v: "3", l: "AI pipelines", sub: "Scout · Forge · Prove" },
          { v: "9", l: "API endpoints", sub: "Pay-per-call USDC" },
          { v: "x402", l: "On Solana", sub: "Phantom + agent wallets" },
        ].map((s) => (
          <div
            key={s.l}
            className="rounded-xl p-4 text-center"
            style={{ background: "white", boxShadow: `0 0 0 1px ${BORDER}` }}
          >
            <div
              className="font-heading text-2xl font-bold"
              style={{ color: FG, letterSpacing: "-0.5px", background: SOLANA_GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              {s.v}
            </div>
            <div className="mt-1 text-xs font-semibold" style={{ color: FG }}>{s.l}</div>
            <div className="mt-0.5 text-[11px]" style={{ color: MUTED }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <H2>Start here</H2>
      <P>
        New to GapSmith? Two recommended paths depending on whether you&apos;re using the
        product or integrating it.
      </P>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Card
          title="Quickstart"
          description="Sign up, buy a tier, run your first Scout report in 5 minutes. For human users."
          href="/docs/quickstart"
        />
        <Card
          title="Agent API reference"
          description="Pay $0.10 USDC, get JSON. Endpoints, x402 protocol, code examples in Python + curl."
          href="/docs/api"
        />
      </div>

      <H2>Go deeper</H2>
      <P>
        Building agents that integrate with GapSmith, or evaluating us as a Solana-native
        AI commerce reference implementation? Start with x402.
      </P>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Card
          title="Architecture"
          description="System overview — Next.js + FastAPI engine + Supabase, BYOK model, daily ingestion cron, x402 payment layer."
          href="/docs/architecture"
        />
        <Card
          title="Pipelines"
          description="Scout / Forge / Prove explained in depth — what each does, what it costs, what quality it produces."
          href="/docs/pipelines"
        />
        <Card
          title="x402 on Solana"
          description="How HTTP 402 + Solana SPL transfers + memo binding turn idempotent pay-per-call into a real protocol."
          href="/docs/x402"
          tag="USP"
        />
        <Card
          title="Agent API reference"
          description="GET endpoints under $0.50, async jobs up to $15. Cost-effective LLM tier so per-call price stays low."
          href="/docs/api"
        />
        <Card
          title="Done-For-You"
          description="We run the pipeline on top-tier LLM (Opus 4.7 / GPT-5.5 Pro) with human review. $39 / $99 / $149 per run."
          href="/docs/done-for-you"
        />
      </div>

      <PrevNext next={{ href: "/docs/quickstart", label: "Quickstart" }} />
    </DocsShell>
  );
}
