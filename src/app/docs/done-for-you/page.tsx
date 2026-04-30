import type { Metadata } from "next";
import Link from "next/link";
import {
  DocsShell,
  DocsHero,
  Takeaway,
  H2,
  H3,
  P,
  MutedP,
  UL,
  InlineCode,
  PrevNext,
  DOCS_TOKENS,
} from "../_components/docs-shell";

export const metadata: Metadata = {
  title: "Done-For-You — GapSmith Docs",
  description: "We run the full Scout / Forge / Prove pipeline on top-tier LLM (Claude Opus 4.7 / GPT-5.5 Pro) with human review. Premium reports for the moments quality matters more than per-call cost.",
};

const { FG, MUTED, BORDER, ACCENT } = DOCS_TOKENS;

const SPARK = "oklch(0.78 0.155 75)";  // gold/spark — Workshop palette accent
const EMBER = "oklch(0.62 0.155 52)";  // ember — bridges to Solana green in palette

function ServiceCard({
  name,
  price,
  turnaround,
  description,
  deliverable,
  modelStack,
}: {
  name: string;
  price: string;
  turnaround: string;
  description: string;
  deliverable: string;
  modelStack: string;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "white",
        boxShadow: `0 0 0 1px ${BORDER}, 0 1px 2px rgba(0,0,0,0.02)`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-lg font-bold" style={{ color: FG, letterSpacing: "-0.5px" }}>
          {name}
        </h3>
        <div className="text-right">
          <div className="font-heading text-2xl font-bold" style={{ color: FG }}>{price}</div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>per run</div>
        </div>
      </div>
      <p className="mt-2 text-sm" style={{ color: MUTED, lineHeight: 1.55 }}>
        {description}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md p-2.5" style={{ background: "oklch(0.97 0.005 80)" }}>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Turnaround</div>
          <div className="mt-0.5 text-sm font-semibold" style={{ color: FG }}>{turnaround}</div>
        </div>
        <div className="rounded-md p-2.5" style={{ background: "oklch(0.97 0.005 80)" }}>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Model stack</div>
          <div className="mt-0.5 text-sm font-semibold" style={{ color: FG }}>{modelStack}</div>
        </div>
      </div>
      <div className="mt-3 rounded-md p-2.5" style={{ background: `oklch(from ${SPARK} l c h / 0.10)`, boxShadow: `inset 0 0 0 1px oklch(from ${SPARK} l c h / 0.25)` }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(0.55 0.155 75)" }}>You receive</div>
        <div className="mt-0.5 text-sm" style={{ color: FG, lineHeight: 1.5 }}>{deliverable}</div>
      </div>
    </div>
  );
}

export default function DoneForYou() {
  return (
    <DocsShell active="/docs/done-for-you">
      <DocsHero
        eyebrow="Done-For-You"
        badge="Premium"
        title="We run the pipeline. You get the report."
        subtitle="A premium tier for the moments quality matters more than per-call cost. We run Scout, Forge, or Prove on top-tier LLM (Claude Opus 4.7 / GPT-5.5 Pro), a human reviewer audits every claim, and you get a polished deliverable in 24-72 hours."
      />

      <Takeaway>
        Two reasons to pick this over the self-serve product:{" "}
        <strong>(1)</strong> you don&apos;t want to manage your own LLM API key, and{" "}
        <strong>(2)</strong> you&apos;re shipping the report to a customer, investor, or board
        — quality of the final document matters more than the per-call price.
      </Takeaway>

      <H2 id="when-to-use">When to use Done-For-You vs self-serve</H2>
      <div
        className="mt-3 overflow-hidden rounded-lg"
        style={{ boxShadow: `0 0 0 1px ${BORDER}` }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "oklch(0.96 0.012 85)", color: FG }}>
              <th className="px-4 py-2 text-left font-semibold">Scenario</th>
              <th className="px-4 py-2 text-left font-semibold">Pick</th>
            </tr>
          </thead>
          <tbody style={{ color: FG }}>
            {[
              ["You have an LLM API key and want to iterate cheaply within your annual quota", "Self-serve (BYOK)"],
              ["You&apos;re an AI agent calling our API at machine speed", "Agent API ($0.05-$15/call)"],
              ["You want a polished report you can send to a customer", "Done-For-You"],
              ["You don&apos;t want to manage your own API key", "Done-For-You"],
              ["You need maximum quality for an investor pitch", "Done-For-You"],
              ["You&apos;ve hit your annual quota and need more runs this cycle", "Done-For-You (overage)"],
            ].map(([scenario, pick], i) => (
              <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td className="px-4 py-2" dangerouslySetInnerHTML={{ __html: scenario }} />
                <td className="px-4 py-2 font-semibold" style={{ color: ACCENT }}>{pick}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="services">The three services</H2>
      <P>
        Each service is sold separately — only pay for the stage you need. You can buy
        Scout alone for $39, then upgrade to Forge / Prove later if the gaps look
        promising.
      </P>

      <div className="mt-6 grid gap-4 sm:grid-cols-1 lg:grid-cols-1">
        <ServiceCard
          name="Scout Run"
          price="$39"
          turnaround="24-48 hours"
          modelStack="Claude Opus 4.7 / GPT-5.5"
          description="We scan your target sectors, ingest fresh signals, score and cluster pain points, then synthesize a complete market gap report — all on top-tier LLM with a human pass for fact-checking and polish."
          deliverable="Full Scout report (PDF + interactive web view), 13K-char daily brief, 10 cross-signals, 3 venture-grade topic cards, 30 keywords, 10 pain clusters."
        />
        <ServiceCard
          name="Forge Run"
          price="$99"
          turnaround="48-72 hours"
          modelStack="Claude Opus 4.7"
          description="We run the 5-round multi-agent ideation against your gaps (Scout output or your own brief), with all 10 agents firing and a manual screening pass on top of the automated kill votes / RICE scores."
          deliverable="Top 3 ideas with 20 structured fields each (moat, problem, why-now, target market, revenue model, competitive landscape, kill switches, validation plan) + full multi-round transcript."
        />
        <ServiceCard
          name="Prove Run"
          price="$149"
          turnaround="48-72 hours"
          modelStack="GPT-5.5 Pro / Opus 4.7"
          description="Our most demanding pipeline — 10 agents debate your idea adversarially across multiple rounds, with Phase A5 fact-checking every claim against cited URLs and a human reviewer adjudicating before delivery."
          deliverable="Verdict (APPROVED / CONDITIONAL / PIVOT OUT / REJECTED) + reasoning + MVP roadmap + ROI breakdown + complete debate transcript."
        />
      </div>

      <H2 id="what-you-get">What makes it different from self-serve</H2>
      <UL>
        <li>
          <strong>Top-tier LLM stack</strong> — Claude Opus 4.7 and GPT-5.5 Pro for every
          agent call (not the cost-balanced Sonnet / MiniMax / GPT-5.4 we run on the
          self-serve and Agent API tiers).
        </li>
        <li>
          <strong>Human review on every report</strong> — a real person reads the LLM
          output, checks the cited URLs, removes hallucinated stats, tightens the
          execution plan.
        </li>
        <li>
          <strong>Polished deliverable</strong> — clean PDF with table of contents and
          formatted tables, plus the interactive web view for sharing a link.
        </li>
        <li>
          <strong>Direct line to us</strong> — reply to the delivery email and you&apos;re
          talking to the same human who reviewed the report.
        </li>
        <li>
          <strong>Refund on failed runs</strong> — if the model errors out or the human
          reviewer flags the output as unfit to ship, we re-run at no cost or refund per{" "}
          <Link href="/terms" className="underline" style={{ color: ACCENT }}>Terms § 4</Link>.
        </li>
      </UL>

      <H2 id="how-to-order">How to order</H2>
      <P>
        Two paths:
      </P>
      <UL>
        <li>
          <strong>From the pricing page</strong> — scroll to the &quot;Done-For-You&quot;
          section on{" "}
          <Link href="/pricing#done-for-you" className="underline" style={{ color: ACCENT }}>
            /pricing
          </Link>
          , pick a service, pay with USDC or card.
        </li>
        <li>
          <strong>By email</strong> —{" "}
          <a href="mailto:gapsmith@draftlabs.org?subject=Done-For-You%20order" className="underline" style={{ color: ACCENT }}>
            gapsmith@draftlabs.org
          </a>{" "}
          with the service tier and a 1-2 sentence brief (sectors / idea / target market).
          We&apos;ll send the invoice and start within the same business day.
        </li>
      </UL>

      <H3 id="brief-format">Brief format (Forge / Prove)</H3>
      <P>
        For Forge and Prove, the more focused the brief, the sharper the output. Aim for
        ~150-300 words covering:
      </P>
      <UL>
        <li><strong>Sector / market</strong> — concrete, e.g. &quot;cross-channel e-commerce SMBs $500K-$10M GMV&quot;.</li>
        <li><strong>Pain or hypothesis</strong> — what gap are you exploring?</li>
        <li><strong>Constraints</strong> — geo / regulation / team size / budget cap.</li>
        <li><strong>What you want out</strong> — &quot;ship-ready execution plan&quot; vs &quot;3 alternatives to compare&quot; etc.</li>
      </UL>
      <MutedP>
        If you skip the brief and just give us &quot;find me a startup idea&quot;, we&apos;ll run the
        Scout pipeline first and recommend a focus area before invoicing for Forge / Prove.
        That keeps the spend honest.
      </MutedP>

      <H2 id="under-the-hood">Under the hood</H2>
      <P>
        Done-For-You runs on top of the same{" "}
        <Link href="/docs/architecture" className="underline" style={{ color: ACCENT }}>
          FastAPI engine
        </Link>{" "}
        as the self-serve product — but we deliver through a different surface: our
        internal <strong>CLI tool</strong> (the same one we ship at the $34.90 power-user
        tier).
      </P>
      <P>
        The CLI gives our reviewers things the web product doesn&apos;t: batch sector
        scanning, scripted brief templates, parallel pipeline runs, and direct access to
        intermediate transcripts so a human can intervene mid-run instead of waiting for
        the final output. Every Done-For-You report goes through:
      </P>
      <UL>
        <li>
          <strong>CLI dispatch</strong> — engine pinned to top-tier model (Opus 4.7 / GPT-5.5 Pro)
          with our reviewer&apos;s reasoning notes attached to the brief.
        </li>
        <li>
          <strong>Reviewer-in-the-loop checkpoints</strong> — at the end of each round our
          reviewer reads the transcript, can re-run a stage with a sharper prompt, or
          inject domain context the model missed.
        </li>
        <li>
          <strong>Human review pass</strong> — every cited URL is opened, every hard stat
          is checked against source, and the final document is rewritten for clarity
          before delivery.
        </li>
        <li>
          <strong>Polished output</strong> — exported to PDF with table of contents +
          formatted tables, plus an interactive web view for sharing.
        </li>
      </UL>
      <MutedP>
        That&apos;s why turnaround is 24-72 hours rather than 30 minutes. The engine work is
        the same; the human + CLI workflow on top is what you&apos;re paying for.
      </MutedP>

      <PrevNext
        prev={{ href: "/docs/pipelines", label: "Pipelines" }}
        next={{ href: "/docs/x402", label: "x402 on Solana" }}
      />

      {/* Order CTA */}
      <div
        className="mt-12 rounded-xl p-5"
        style={{
          background: `linear-gradient(135deg, oklch(from ${SPARK} l c h / 0.12), oklch(from ${EMBER} l c h / 0.06))`,
          boxShadow: `inset 0 0 0 1px oklch(from ${SPARK} l c h / 0.30)`,
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-heading text-lg font-bold" style={{ color: FG }}>
              Ready to order?
            </h3>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              Pricing card on /pricing accepts USDC or card. Or email us with your brief.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/pricing#done-for-you"
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: SPARK, color: "oklch(0.18 0.025 65)" }}
            >
              See pricing →
            </Link>
            <a
              href="mailto:gapsmith@draftlabs.org?subject=Done-For-You%20order"
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: "oklch(1 0.005 85)", color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
            >
              Email a brief
            </a>
          </div>
        </div>
      </div>
    </DocsShell>
  );
}
