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
  title: "Pipelines — GapSmith Docs",
  description: "Scout, Forge, and Prove explained — what each pipeline does, what it costs, and what quality you should expect.",
};

const { FG, MUTED, BORDER, ACCENT, SOLANA_GRADIENT } = DOCS_TOKENS;

function PipelineCard({
  step,
  name,
  tagline,
  cost,
  duration,
  callouts,
}: {
  step: number;
  name: string;
  tagline: string;
  cost: string;
  duration: string;
  callouts: { label: string; value: string }[];
}) {
  return (
    <div
      className="mt-6 rounded-xl p-5"
      style={{ background: "white", boxShadow: `0 0 0 1px ${BORDER}, 0 1px 2px rgba(0,0,0,0.02)` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-full font-heading text-sm font-bold"
            style={{ background: SOLANA_GRADIENT, color: "white" }}
          >
            {step}
          </span>
          <div>
            <h3 className="font-heading text-lg font-bold" style={{ color: FG, letterSpacing: "-0.5px" }}>
              {name}
            </h3>
            <p className="text-sm" style={{ color: MUTED }}>{tagline}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-heading text-base font-bold" style={{ color: FG }}>{cost}</div>
          <div className="text-xs" style={{ color: MUTED }}>{duration}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {callouts.map((c) => (
          <div key={c.label} className="rounded-md p-2.5" style={{ background: "oklch(0.97 0.005 80)" }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{c.label}</div>
            <div className="mt-0.5 text-sm font-semibold" style={{ color: FG }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Pipelines() {
  return (
    <DocsShell active="/docs/pipelines">
      <DocsHero
        eyebrow="Pipelines"
        title="Scout · Forge · Prove."
        subtitle="Three multi-LLM pipelines, designed to run in sequence or independently. Each does one job well — find gaps, generate ideas, debate them — and hands off clean structured state to the next."
      />

      <Takeaway>
        Run them as a chain (<strong>Scout → Forge → Prove</strong>) for a $3-$10 end-to-end venture
        thesis (cheap default ~$3, top-tier ~$9). Or one at a time when you just want fresh
        signals, rapid ideation, or a pre-mortem on an existing idea.
      </Takeaway>

      <PipelineCard
        step={1}
        name="Scout"
        tagline="Daily market intelligence — find the gaps the market hasn't noticed yet."
        cost="~$1.50"
        duration="~6 min"
        callouts={[
          { label: "Sectors", value: "Up to 10" },
          { label: "Articles ingested", value: "70-90" },
          { label: "Pain signals", value: "200-400" },
          { label: "Top ideas surfaced", value: "3 topics" },
        ]}
      />

      <H3 id="scout-flow">What Scout does</H3>
      <P>
        Scout runs over a daily snapshot of <strong>79 RSS sources</strong> + <strong>100
        community-pain sources</strong> (Reddit, HN, Lobsters, GitHub Issues), prefiltered by
        the sectors you select. Five stages:
      </P>
      <UL>
        <li>
          <strong>Fetch</strong> — pull cached articles + pain posts for your sectors
        </li>
        <li>
          <strong>Score</strong> — LLM scores each article (idea_potential, confidence A-D),
          and clusters pain posts into themes by sector + frequency
        </li>
        <li>
          <strong>Curate</strong> — pick top 8 articles, top 10 pain clusters, link them
          into <em>cross-signals</em> (article × pain → startup wedge)
        </li>
        <li>
          <strong>Topics</strong> — synthesize 3 venture-grade topic cards with trend signal,
          severity-tagged pain signals, and a core question
        </li>
        <li>
          <strong>Brief</strong> — assemble the daily brief (overview, takeaway, narratives,
          sector heatmap)
        </li>
      </UL>

      <H3 id="scout-quality">Quality benchmark</H3>
      <P>
        On the <InlineCode>claude-sonnet-4-6</InlineCode> baseline (3 sectors, ~$1.73): 13K-char daily
        brief, 10 sharp cross-signals linking news to pain to wedge, 3 topics with concrete
        market wedges + competitor pricing, 30 keywords reflecting real domain vocabulary
        (after our stopword + per-cluster cap fixes).
      </P>
      <MutedP>
        MiniMax M2.7 produces nearly identical structural quality at ~$0.45. Grok 4 was
        weaker on Scout — generic topics, hallucinated sources — and is no longer offered.
      </MutedP>

      <PipelineCard
        step={2}
        name="Forge"
        tagline="Multi-agent ideation — turn gaps into screened, ranked startup ideas."
        cost="~$0.45 - $2.20"
        duration="~30 min"
        callouts={[
          { label: "Rounds", value: "5 + screen" },
          { label: "Agents", value: "5 main + 5 sub" },
          { label: "Top ideas", value: "3 ranked" },
          { label: "Fields per idea", value: "20" },
        ]}
      />

      <H3 id="forge-flow">What Forge does</H3>
      <P>
        Forge takes context (a Scout report, or your own free-form input) and runs a
        five-round structured conversation between agents:
      </P>
      <UL>
        <li>
          <strong>Round 1</strong> — Pain discovery (gated): Proposer drafts pain points;
          Trend Scout, Contrarian, Gap Finder, Benchmark Hunter, Evidence Hunter add
          competitive + adjacent-market context
        </li>
        <li>
          <strong>Rounds 2-4</strong> — Iterative deepening: Defender plays creative
          coach pushing on differentiation, pricing, and the &quot;stop-scrolling sentence&quot;;
          Proposer commits to specifics
        </li>
        <li>
          <strong>Round 5</strong> — Top-3 selection with explicit hybrid &amp; portfolio
          analysis
        </li>
        <li>
          <strong>Screening pass</strong> — All 5 agents cast a kill vote and a RICE score;
          tie-breaks resolved via aggregate RICE total
        </li>
      </UL>
      <P>
        Each surviving idea ships with 20 structured fields including moat, problem,
        why-now, target market, revenue model, competitive landscape, kill switches with
        thresholds, and a 3-step validation plan with numeric success criteria.
      </P>

      <H3 id="forge-quality">Quality benchmark</H3>
      <P>
        On <InlineCode>claude-opus-4-7</InlineCode> ($2.19/run): Three venture-grade ideas with
        concrete pricing tiers, traceable Reddit/Trustpilot/G2 sources, full RICE scoring
        from each agent, and explicit kill votes with reasoning.
      </P>
      <MutedP>
        Sonnet 4.6 and Gemini Flash variants are restricted to Scout — we observed quality
        drops in Forge&apos;s 5-round screening with those models. The cheapest viable Forge
        model is MiniMax M2.7 (~$0.45/run, well-balanced). Opus 4.7 / GPT-5.5 are the
        quality picks for venture-grade output.
      </MutedP>

      <PipelineCard
        step={3}
        name="Prove"
        tagline="Multi-agent debate — pre-mortem the idea before you build it."
        cost="~$2.50 - $5.50"
        duration="~20 min"
        callouts={[
          { label: "Agents", value: "5 main + 5 sub" },
          { label: "Rounds", value: "Up to 4" },
          { label: "Verdicts", value: "4 outcomes" },
          { label: "Fact-check", value: "Phase A5" },
        ]}
      />

      <H3 id="prove-flow">What Prove does</H3>
      <P>
        Prove runs an adversarial debate: Proposer defends the idea, Challenger attacks
        market viability, Analyst pressure-tests the unit economics, Defender plays
        steelman, and Reviewer audits every factual claim against URLs in a Phase A5 pass.
        Sub-agents (Contrarian, Gap Finder, Trend Scout, Evidence Hunter, Benchmark
        Hunter) inject competitive context.
      </P>
      <P>
        After each round the panel can vote on one of four verdicts:
      </P>
      <UL>
        <li>
          <strong>APPROVED</strong> — strong consensus to build
        </li>
        <li>
          <strong>CONDITIONAL</strong> — proceed if conditions are met
        </li>
        <li>
          <strong>REJECTED</strong> — Challenger&apos;s market-viability veto fires
        </li>
        <li>
          <strong>PIVOT OUT</strong> — the idea changed category mid-debate; the panel
          recommends pivoting and produces a Pivot Report instead of an execution plan
        </li>
      </UL>
      <MutedP>
        Verdict logic includes idempotency: replaying the same X-Payment tx returns the
        same verdict, no double-charge.
      </MutedP>

      <H3 id="prove-quality">Quality benchmark</H3>
      <P>
        On <InlineCode>gpt-5.5</InlineCode> ($5.50/run): all 5 main agents + all 5 sub-agents fire
        with 5K-25K chars of analysis each. Phase A5 fact-checks every claim against
        cited URLs. Verdict + 18.8K-char Pivot Report when the panel pivots.
      </P>

      <H2 id="how-they-chain">How they chain together</H2>
      <P>
        Each pipeline writes structured state to its session table. The next pipeline reads
        that state to seed its prompt:
      </P>
      <UL>
        <li>
          <strong>Scout → Forge</strong> — Forge reads <InlineCode>scout_reports.topics</InlineCode> and{" "}
          <InlineCode>scout_reports.daily_brief</InlineCode> as Round 0 context
        </li>
        <li>
          <strong>Forge → Prove</strong> — pick one idea from{" "}
          <InlineCode>forge_sessions.top_ideas</InlineCode>; Prove reads its 20 structured fields
          to seed the debate
        </li>
        <li>
          <strong>Standalone</strong> — every pipeline also accepts free-form input, so you
          can skip the chain and feed your own idea directly into Forge or Prove
        </li>
      </UL>

      <H2 id="cost-summary">Cost summary at a glance</H2>
      <div
        className="mt-3 overflow-hidden rounded-lg"
        style={{ boxShadow: `0 0 0 1px ${BORDER}` }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "oklch(0.96 0.012 85)", color: FG }}>
              <th className="px-4 py-2 text-left font-semibold">Pipeline</th>
              <th className="px-4 py-2 text-left font-semibold">Cheap default</th>
              <th className="px-4 py-2 text-left font-semibold">Quality pick</th>
              <th className="px-4 py-2 text-left font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody style={{ color: FG }}>
            <tr style={{ borderTop: `1px solid ${BORDER}` }}>
              <td className="px-4 py-2 font-semibold">Scout</td>
              <td className="px-4 py-2">MiniMax M2.7 — $0.45</td>
              <td className="px-4 py-2">Sonnet 4.6 — $1.50</td>
              <td className="px-4 py-2">~6 min</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${BORDER}` }}>
              <td className="px-4 py-2 font-semibold">Forge</td>
              <td className="px-4 py-2">MiniMax M2.7 — $0.45</td>
              <td className="px-4 py-2">Opus 4.7 — $2.20</td>
              <td className="px-4 py-2">~30 min</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${BORDER}` }}>
              <td className="px-4 py-2 font-semibold">Prove</td>
              <td className="px-4 py-2">GPT-5.4 — $1.20</td>
              <td className="px-4 py-2">GPT-5.5 — $5.50</td>
              <td className="px-4 py-2">~20 min</td>
            </tr>
          </tbody>
        </table>
      </div>
      <MutedP>
        All costs are pass-through to your LLM provider — GapSmith doesn&apos;t take a margin
        on token spend. Your purchase covers software access; your API key covers compute.
      </MutedP>

      <H2 id="two-tiers">Agent API vs Done-For-You</H2>
      <P>
        These pipelines are also available as paid services. We deliberately split them
        into two tiers based on price-quality trade-off:
      </P>
      <div
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <div
          className="rounded-xl p-4"
          style={{
            background: `oklch(from ${ACCENT} l c h / 0.06)`,
            boxShadow: `inset 0 0 0 1px oklch(from ${ACCENT} l c h / 0.20)`,
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>
            Agent API
          </div>
          <div className="mt-1 font-heading text-base font-bold" style={{ color: FG }}>
            Cost-effective LLM
          </div>
          <p className="mt-1.5 text-sm" style={{ color: FG, lineHeight: 1.55 }}>
            Endpoints under <InlineCode>/api/v1/*</InlineCode> run on a balanced cost-effective LLM
            (MiniMax / Sonnet 4.6 tier) so per-call USDC pricing stays in the $0.05–$15
            range. Right tier when an agent just needs fresh signal at machine speed.
          </p>
          <Link
            href="/docs/api"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: ACCENT }}
          >
            Agent API reference →
          </Link>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.155 75 / 0.10), oklch(0.62 0.155 52 / 0.06))",
            boxShadow: "inset 0 0 0 1px oklch(0.78 0.155 75 / 0.30)",
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(0.55 0.155 75)" }}>
            Done-For-You
          </div>
          <div className="mt-1 font-heading text-base font-bold" style={{ color: FG }}>
            Top-tier LLM + human review
          </div>
          <p className="mt-1.5 text-sm" style={{ color: FG, lineHeight: 1.55 }}>
            We run the full pipeline on Claude Opus 4.7 / GPT-5.5 Pro with a human pass on
            top of every report. Right tier when quality matters more than per-call cost.
            $39 / $99 / $149 per run.
          </p>
          <Link
            href="/docs/done-for-you"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: "oklch(0.55 0.155 75)" }}
          >
            Done-For-You details →
          </Link>
        </div>
      </div>

      <PrevNext
        prev={{ href: "/docs/architecture", label: "Architecture" }}
        next={{ href: "/docs/x402", label: "x402 on Solana" }}
      />

      <div
        className="mt-12 rounded-lg p-4 text-xs"
        style={{ background: `oklch(from ${ACCENT} l c h / 0.06)`, color: FG }}
      >
        Want to see real output? Try the live{" "}
        <Link href="/scout" className="underline" style={{ color: ACCENT }}>
          Scout
        </Link>
        {" / "}
        <Link href="/forge" className="underline" style={{ color: ACCENT }}>
          Forge
        </Link>
        {" / "}
        <Link href="/prove" className="underline" style={{ color: ACCENT }}>
          Prove
        </Link>
        {" "}pages. Or hit the Agent API directly — see the{" "}
        <Link href="/docs/api" className="underline" style={{ color: ACCENT }}>
          API reference
        </Link>
        .
      </div>
    </DocsShell>
  );
}
