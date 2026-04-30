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
  CodeBlock,
  InlineCode,
  PrevNext,
  DOCS_TOKENS,
} from "../_components/docs-shell";

export const metadata: Metadata = {
  title: "Architecture — GapSmith Docs",
  description: "How GapSmith is built — Next.js + FastAPI engine + Supabase + x402 layer. Where each piece runs and why.",
};

export default function Architecture() {
  const { FG, MUTED, BORDER, ACCENT } = DOCS_TOKENS;

  return (
    <DocsShell active="/docs/architecture">
      <DocsHero
        eyebrow="Architecture"
        title="How GapSmith is built."
        subtitle="A pragmatic stack — Next.js for UX, a FastAPI engine for the heavy AI pipelines, Supabase for state, and x402 for AI-agent commerce on Solana."
      />

      <Takeaway>
        Two-process model: a stateless <strong>web app</strong> handles auth, payments, and
        the agent API surface; a separate <strong>Python engine</strong> runs the
        long-running multi-LLM pipelines. Both share <strong>Supabase</strong> for state
        and Realtime progress.
      </Takeaway>

      <H2 id="diagram">System diagram</H2>

      <pre
        className="mt-3 overflow-x-auto rounded-lg p-5 text-[11px] leading-relaxed"
        style={{
          background: "#0a0a0a",
          color: "#e8e8e8",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
{`┌─────────────────────────────────────────────────────────────────────────┐
│  HUMAN BROWSER  ←─── Phantom wallet ──── Solana mainnet (USDC)         │
│       │                                       ▲                         │
│       ▼                                       │                         │
│  ┌──────────────────────────────┐    ┌─────────────────────────────┐    │
│  │  Next.js (Railway)            │    │  AI AGENT (any wallet)      │    │
│  │   /pricing  /scout  /forge    │    │   probe → 402 → sign → 200  │    │
│  │   /prove    /settings         │    └──────────┬──────────────────┘    │
│  │   /api/checkout/x402/verify   │               │                       │
│  │   /api/v1/* (agent API)       │◄──────────────┘                       │
│  └────┬───────────┬──────────────┘                                       │
│       │           │                                                      │
│       │ Supabase  │ ENGINE_URL                                           │
│       ▼           ▼                                                      │
│  ┌─────────┐ ┌─────────────────────────────────────────────────┐         │
│  │Supabase │ │  FastAPI engine (Railway, separate service)      │        │
│  │ Auth    │ │   /api/engine/scout   ─→ run_scout()             │        │
│  │ Postgres│ │   /api/engine/forge   ─→ run_ideation()          │        │
│  │ Storage │ │   /api/engine/prove   ─→ run_debate()            │        │
│  │ Realtime│ │   LiteLLM → Claude / GPT / Gemini / MiniMax …    │        │
│  └─────────┘ │   Tavily for search-less providers               │        │
│              │   Daily ingestion cron (RSS + Reddit + HN)       │        │
│              └─────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘`}
      </pre>

      <H2 id="components">Components</H2>

      <H3 id="webapp">1. Next.js web app</H3>
      <P>
        Single Next.js 15 app on Railway behind <InlineCode>gapsmith.draftlabs.org</InlineCode>.
        Owns:
      </P>
      <UL>
        <li>All UX — pricing, settings, run pages, report viewers</li>
        <li>Auth (Supabase, Google OAuth + magic-link)</li>
        <li>Payment paths — Stripe webhooks <em>and</em> on-chain x402 verification</li>
        <li>The Agent API surface (<InlineCode>/api/v1/*</InlineCode>) that wraps the engine</li>
      </UL>
      <MutedP>
        The web app never makes LLM calls itself. It dispatches to the engine and
        subscribes to Supabase Realtime for progress updates.
      </MutedP>

      <H3 id="engine">2. Python engine (FastAPI)</H3>
      <P>
        Separate Railway service running <InlineCode>uvicorn engine.api:app</InlineCode>. Three
        endpoints, one per pipeline, all backgrounded via FastAPI <InlineCode>BackgroundTasks</InlineCode>:
      </P>
      <CodeBlock lang="text">{`POST /api/engine/scout    → ~6 min,  ~$1.50  (3 sectors)
POST /api/engine/forge    → ~30 min, ~$0.45  (5 rounds + screening, MiniMax)
POST /api/engine/prove    → ~20 min, ~$5.50  (multi-agent debate, GPT-5.5)`}</CodeBlock>
      <P>
        Why a separate process: the pipelines run 30+ LLM calls per session, with adaptive
        token budgets and retry-on-rate-limit. Keeping them out of the Next.js request
        path means the web app stays snappy and we can scale the engine independently.
      </P>
      <P>
        LLM routing goes through <InlineCode>litellm</InlineCode> so swapping models is one config
        change. Search routing: Gemini uses native <InlineCode>googleSearchRetrieval</InlineCode>;
        everyone else (Claude, GPT, MiniMax) falls back to Tavily injected into the prompt.
      </P>

      <H3 id="supabase">3. Supabase (Postgres + Auth + Realtime)</H3>
      <P>Schema in plain English:</P>
      <UL>
        <li>
          <InlineCode>auth.users</InlineCode> — Supabase-managed
        </li>
        <li>
          <InlineCode>api_keys</InlineCode> — encrypted BYOK keys, one per (user, provider)
        </li>
        <li>
          <InlineCode>purchases</InlineCode> — one row per SKU bought (scout / forge / prove / bundle / cli)
        </li>
        <li>
          <InlineCode>usage_counters</InlineCode> — 365-day rolling quota per purchase
        </li>
        <li>
          <InlineCode>scout_reports</InlineCode>, <InlineCode>forge_sessions</InlineCode>,{" "}
          <InlineCode>prove_sessions</InlineCode> — pipeline state + final output
        </li>
        <li>
          <InlineCode>agent_jobs</InlineCode> — async x402 job records (status, result, webhook)
        </li>
        <li>
          <InlineCode>x402_pending_payments</InlineCode> — idempotency by tx hash
        </li>
      </UL>
      <P>
        Realtime channels stream <InlineCode>progress</InlineCode> + <InlineCode>progress_message</InlineCode>{" "}
        column updates so the run pages animate live without polling.
      </P>

      <H3 id="x402">4. x402 layer</H3>
      <P>
        The pay-per-call wrapper at <InlineCode>src/lib/x402-server.ts</InlineCode> — covered in detail
        on the{" "}
        <Link href="/docs/x402" className="underline" style={{ color: ACCENT }}>
          x402 page
        </Link>
        . TL;DR: every <InlineCode>/api/v1/*</InlineCode> route is wrapped in{" "}
        <InlineCode>withX402Payment(handler, {`{ priceUsdcAtomic, sku }`})</InlineCode>; the wrapper
        parses the <InlineCode>X-Payment</InlineCode> header, validates the on-chain SPL transfer
        with memo binding, and 402s when missing.
      </P>

      <H3 id="cron">5. Daily ingestion cron</H3>
      <P>
        Every morning a scheduled task fetches:
      </P>
      <UL>
        <li>79 RSS sources across 20 industry sectors</li>
        <li>100 community-pain sources (Reddit, HN, Lobsters, GitHub Issues, Twitter)</li>
      </UL>
      <P>
        Stored in <InlineCode>data/feeds/news/</InlineCode> + <InlineCode>data/feeds/pain/</InlineCode>,
        with confidence scoring (A/B/C/D) and per-sector deduplication. Scout runs read this
        daily snapshot — that&apos;s how a $1.50 Scout report covers ~70 articles + ~250 pain
        signals: ingestion is amortized.
      </P>

      <H2 id="deployment">Deployment</H2>
      <P>
        Both services live on{" "}
        <Link href="https://railway.app" className="underline" style={{ color: ACCENT }}>
          Railway
        </Link>
        :
      </P>
      <UL>
        <li>
          <strong>web</strong> — Node 20 + Next.js 15, deploys on every push to{" "}
          <InlineCode>main</InlineCode>
        </li>
        <li>
          <strong>engine</strong> — Python 3.12 + FastAPI, separate Dockerfile in{" "}
          <InlineCode>engine/Dockerfile</InlineCode>
        </li>
      </UL>
      <P>
        DNS is Cloudflare (<InlineCode>gapsmith.draftlabs.org</InlineCode> → Railway CNAME).
        Email is Cloudflare email-routing forwarding{" "}
        <InlineCode>gapsmith@draftlabs.org</InlineCode> to the founder&apos;s personal inbox.
      </P>

      <H2 id="security">Security &amp; trust</H2>
      <UL>
        <li>
          <strong>BYOK keys are AES-GCM encrypted</strong> at rest with{" "}
          <InlineCode>ENCRYPTION_SECRET</InlineCode> (Railway env). Keys are decrypted only in the
          start-route process, passed once over the internal Railway network to the engine,
          and never logged.
        </li>
        <li>
          <strong>x402 verification is server-side</strong>. The browser pre-flight only
          checks SOL/USDC balance via Helius. The actual payment validation re-fetches the
          tx from the Solana RPC, asserts source/destination/amount/memo, and writes an
          idempotency row keyed on <InlineCode>tx_hash UNIQUE</InlineCode>.
        </li>
        <li>
          <strong>Row-level security</strong> on every user-scoped table. Service-role
          bypass only in webhooks (Stripe + agent_jobs status), not in user-facing routes.
        </li>
      </UL>

      <PrevNext
        prev={{ href: "/docs/quickstart", label: "Quickstart" }}
        next={{ href: "/docs/pipelines", label: "Pipelines" }}
      />

      <div
        className="mt-12 rounded-lg p-4 text-xs"
        style={{ background: "white", boxShadow: `inset 0 0 0 1px ${BORDER}`, color: MUTED }}
      >
        Web app lives under <InlineCode>src/</InlineCode>, engine under{" "}
        <InlineCode>engine/</InlineCode>. Source access available on request — see{" "}
        <Link href="/contact" className="underline" style={{ color: FG }}>/contact</Link>.
      </div>
    </DocsShell>
  );
}
