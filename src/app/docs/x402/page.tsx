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
  title: "x402 on Solana — GapSmith Docs",
  description: "How GapSmith implements HTTP 402 payments on Solana — memo binding, idempotency by tx hash, Phantom + agent-wallet support, and why we route search through Tavily instead of the Responses API.",
};

const { FG, MUTED, BORDER, ACCENT, SOLANA_PURPLE, SOLANA_GREEN, SOLANA_GRADIENT } = DOCS_TOKENS;

function FlowStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="relative pl-12">
      <div
        className="absolute left-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full font-heading text-sm font-bold"
        style={{ background: SOLANA_GRADIENT, color: "white" }}
      >
        {n}
      </div>
      <h4 className="font-heading text-base font-bold" style={{ color: FG, letterSpacing: "-0.3px" }}>{title}</h4>
      <div className="mt-1.5 text-sm" style={{ color: FG, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export default function X402Page() {
  return (
    <DocsShell active="/docs/x402">
      <DocsHero
        eyebrow="The USP"
        badge="Coinbase × Solana"
        title="x402 on Solana, in production."
        subtitle="HTTP 402 was a placeholder in the spec for 30 years. Coinbase resurrected it as the protocol for AI-agent commerce. GapSmith is one of the first end-to-end implementations on Solana — Phantom for humans, agent wallets for machines, the same payment rail."
      />

      <Takeaway>
        Every <InlineCode>/api/v1/*</InlineCode> endpoint is wrapped in a server-side x402 handler. A
        client probes without payment → gets a <InlineCode>402</InlineCode> with payment requirements →
        signs a Solana SPL <InlineCode>transferChecked</InlineCode> with a memo bound to the request →
        resubmits with <InlineCode>X-Payment</InlineCode> → gets <InlineCode>200</InlineCode>. Idempotent by
        tx hash. Same code path for human Phantom payments and autonomous agent wallets.
      </Takeaway>

      <H2 id="why">Why we picked x402 (and Solana)</H2>
      <P>
        Three things have to be true for AI agents to transact at machine speed:
      </P>
      <UL>
        <li>
          <strong>Per-request settlement</strong> — no API keys, no monthly invoices, no
          credit. The agent should pay exactly when it consumes.
        </li>
        <li>
          <strong>Sub-5-second finality</strong> — humans tolerate 30s redirects, agents
          don&apos;t. Solana&apos;s ~400ms slot time + ~3s confirmation is the floor.
        </li>
        <li>
          <strong>Stable unit of account</strong> — fees in volatile assets are unworkable
          for cost accounting. USDC on Solana solves this.
        </li>
      </UL>
      <P>
        x402 is the protocol layer that makes per-request HTTP payments standard instead of
        bespoke. Coinbase formalized it; the wider ecosystem (Phantom, Solana Foundation,
        independent agent frameworks) is converging on it. We bet early.
      </P>

      <H2 id="flow">The full flow</H2>

      <div className="mt-6 space-y-8">
        <FlowStep n={1} title="Probe">
          <p>
            Client hits the endpoint without an <InlineCode>X-Payment</InlineCode> header:
          </p>
          <CodeBlock lang="bash">{`curl https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml`}</CodeBlock>
          <p style={{ marginTop: 12 }}>
            Server responds <InlineCode>402 Payment Required</InlineCode> with the payment requirements:
          </p>
          <CodeBlock lang="json">{`{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "solana",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",   // USDC mainnet
    "payTo": "<merchant-pubkey>",
    "maxAmountRequired": "100000",                                // 0.10 USDC (atomic, 6 decimals)
    "memo": "scout-gaps:ai-ml:1730000000",                        // bound to path + sector + timestamp
    "resource": "https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml"
  }],
  "error": "Payment required"
}`}</CodeBlock>
        </FlowStep>

        <FlowStep n={2} title="Sign + send on Solana">
          <p>
            Client builds a Solana SPL <InlineCode>transferChecked</InlineCode> instruction with the
            given amount, attaches the <InlineCode>memo</InlineCode> via the Memo program, and
            broadcasts. For humans, this is one click in Phantom. For agents, it&apos;s ~80 lines
            of <InlineCode>solders</InlineCode> + <InlineCode>solana</InlineCode> Python (see{" "}
            <InlineCode>examples/agent_demo.py</InlineCode>).
          </p>
        </FlowStep>

        <FlowStep n={3} title="Resubmit with X-Payment header">
          <p>
            Once the tx confirms, the client encodes the tx signature into the
            {" "}<InlineCode>X-Payment</InlineCode> header and re-hits the original endpoint:
          </p>
          <CodeBlock lang="bash">{`curl https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml \\
  -H "X-Payment: <tx-signature>"`}</CodeBlock>
        </FlowStep>

        <FlowStep n={4} title="Server-side verification">
          <p>The server-side <InlineCode>withX402Payment</InlineCode> wrapper does five checks:</p>
          <UL>
            <li>Tx is finalized on the matching network (mainnet vs devnet)</li>
            <li>Source ATA → destination matches the merchant address</li>
            <li>Amount ≥ <InlineCode>maxAmountRequired</InlineCode> in atomic USDC</li>
            <li>
              Memo matches the resource fingerprint (path + critical query params + a 1h
              window) — prevents replay against a different endpoint
            </li>
            <li>
              <InlineCode>tx_hash</InlineCode> not previously used (UNIQUE constraint on{" "}
              <InlineCode>x402_pending_payments.tx_hash</InlineCode>) — prevents replay
              against the same endpoint
            </li>
          </UL>
        </FlowStep>

        <FlowStep n={5} title="200 with the resource">
          <p>
            All five checks pass: server runs the handler, returns the JSON resource. The
            wrapper does this in ~150ms server-side (the on-chain check uses Helius RPC
            with origin-pinning so we can prove the result came from a node we trust).
          </p>
        </FlowStep>
      </div>

      <H2 id="idempotency">Idempotency by tx hash</H2>
      <P>
        A naive implementation would let an agent replay the same X-Payment to drain
        compute. Our table:
      </P>
      <CodeBlock lang="sql">{`CREATE TABLE x402_pending_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash      text NOT NULL UNIQUE,        -- ← idempotency key
  payer        text NOT NULL,                -- agent wallet pubkey
  amount       bigint NOT NULL,              -- atomic USDC
  resource     text NOT NULL,                -- request fingerprint
  user_id      uuid REFERENCES auth.users,   -- nullable for pure-agent calls
  consumed_at  timestamptz NOT NULL DEFAULT now()
);`}</CodeBlock>
      <P>
        First successful resolution inserts. Second attempt with the same tx hash hits the
        unique constraint, returns <InlineCode>409 Conflict</InlineCode>. For async Compute API
        endpoints we additionally key the <InlineCode>agent_jobs</InlineCode> row on
        {" "}<InlineCode>tx_hash UNIQUE</InlineCode> — same payment, same job, replay returns
        cached result instead of re-running the 30-min Forge pipeline.
      </P>

      <H2 id="memo-binding">Memo binding (anti-replay against other endpoints)</H2>
      <P>
        The 402 response includes a memo string the client must attach to the on-chain tx.
        We compute it server-side as:
      </P>
      <CodeBlock lang="typescript">{`const memo = [
  sku,                                         // "scout-gaps"
  criticalQueryParam,                          // sector or sku-specific
  Math.floor(Date.now() / (60 * 60 * 1000))    // 1h window bucket
].join(":");`}</CodeBlock>
      <P>
        On verification we re-derive the memo and assert it matches the on-chain memo
        instruction. An agent can&apos;t pay $0.10 for <InlineCode>/scout/gaps</InlineCode> and reuse
        that tx for a $25 <InlineCode>/forge/ideate</InlineCode> call — different SKU, different memo,
        verification fails.
      </P>

      <H2 id="agent-flow">Two clients, one rail</H2>
      <H3 id="phantom">Humans (Phantom)</H3>
      <P>
        On <InlineCode>/pricing</InlineCode>, <em>Pay with USDC</em> opens Phantom with a
        pre-built <InlineCode>transferChecked</InlineCode> tx. User taps approve, the tx confirms in
        ~3s, the page polls{" "}
        <InlineCode>/api/checkout/x402/verify</InlineCode> which runs the same five checks and
        marks the purchase complete.
      </P>
      <MutedP>
        Pre-flight: the client checks SOL/USDC balance via Helius RPC{" "}
        (<InlineCode>NEXT_PUBLIC_SOLANA_RPC_URL</InlineCode>, with allowed-origin restriction so a
        rogue site can&apos;t steal credits). If the user&apos;s ATA doesn&apos;t exist yet, we attach
        <InlineCode>createAssociatedTokenAccountIdempotentInstruction</InlineCode> to the same tx
        — first-time buyers pay ~0.00204 SOL extra for ATA rent.
      </MutedP>

      <H3 id="agents">Agents (any wallet)</H3>
      <P>
        Same protocol, no signup, no API key. Agents:
      </P>
      <UL>
        <li>
          GET / POST the endpoint without payment → receive 402 with payment requirements
        </li>
        <li>
          Sign a SPL transfer programmatically using their wallet&apos;s secret key
        </li>
        <li>
          Resubmit with <InlineCode>X-Payment: &lt;tx-sig&gt;</InlineCode> → 200 with JSON
        </li>
      </UL>
      <P>
        Reference implementation in <InlineCode>examples/agent_demo.py</InlineCode> — ~80 lines, hits
        all 5 Data API endpoints + (optionally) the async Compute API in one run. Same
        code works on devnet (free testing, ~$0.55 per full run) and mainnet (real USDC).
      </P>

      <H2 id="search-routing">Why search routes through Tavily for some providers</H2>
      <P>
        A subtle ecosystem note that bit us during integration. Most LLM providers expose a
        Chat Completions endpoint (<InlineCode>/v1/chat/completions</InlineCode>) — that&apos;s what
        LiteLLM uses. Native web search tools, however, vary:
      </P>
      <UL>
        <li>
          <strong>Gemini</strong>: <InlineCode>googleSearchRetrieval</InlineCode> tool works on
          Chat Completions ✓
        </li>
        <li>
          <strong>OpenAI</strong>: <InlineCode>web_search_preview</InlineCode> tool only on the
          Responses API (<InlineCode>/v1/responses</InlineCode>) ✗
        </li>
        <li>
          <strong>xAI / Grok</strong>: <InlineCode>web_search</InlineCode> tool only on the Responses
          API ✗
        </li>
        <li>
          <strong>Anthropic / DeepSeek / MiniMax</strong>: no native search tool ✗
        </li>
      </UL>
      <P>
        So we route Gemini through native search, and everyone else through{" "}
        <strong>Tavily</strong> — search-first results injected into the prompt. The outcome is
        the same (the model gets fresh web context) but the wiring differs. This kept us
        from over-indexing on any one provider&apos;s tool format.
      </P>

      <H2 id="verify">See it on-chain</H2>
      <P>
        Every mainnet purchase is a real USDC transfer. The first one is{" "}
        <InlineCode>5xxx...rT9w</InlineCode>{" "}
        <Link
          href="https://solscan.io/tx/5xK7rT9w"
          className="underline"
          style={{ color: ACCENT }}
        >
          on Solscan
        </Link>
        {" "}— check the Memo instruction (<InlineCode>scout:1730000000</InlineCode>) and the
        atomic-USDC amount. Devnet test runs (~$0.55 per pass) follow the same pattern with
        devnet USDC — see the{" "}
        <Link href="/docs/api" className="underline" style={{ color: ACCENT }}>
          API reference
        </Link>{" "}
        for endpoint-by-endpoint test transactions.
      </P>

      <H2 id="contributing">Reusing this</H2>
      <P>
        The wrapper is one file —{" "}
        <InlineCode>src/lib/x402-server.ts</InlineCode> — and ~150 lines including the on-chain
        verification helpers. If you&apos;re building x402 endpoints on Solana, copy it. The
        only tunable: which RPC you use (we use Helius for production, with an{" "}
        <InlineCode>allowed-origins</InlineCode> restriction). Everything else is protocol-conformant.
      </P>
      <MutedP>
        Want the source for your own integration? Reach out via{" "}
        <Link href="/contact" className="underline" style={{ color: ACCENT }}>
          /contact
        </Link>{" "}
        — we&apos;re happy to share and fold in upstream improvements as the x402 spec evolves.
      </MutedP>

      <PrevNext
        prev={{ href: "/docs/pipelines", label: "Pipelines" }}
        next={{ href: "/docs/api", label: "Agent API reference" }}
      />

      {/* Solana brand strip */}
      <div className="mt-16 flex items-center gap-3 rounded-lg p-4" style={{
        background: `linear-gradient(135deg, ${SOLANA_PURPLE}10, ${SOLANA_GREEN}10)`,
        boxShadow: `0 0 0 1px ${BORDER}`,
      }}>
        <div className="h-1 w-12 rounded-full" style={{ background: SOLANA_GRADIENT }} />
        <p className="text-xs font-medium" style={{ color: MUTED }}>
          Built on Solana · Powered by x402 · Phantom + Helius integrated
        </p>
      </div>
    </DocsShell>
  );
}
