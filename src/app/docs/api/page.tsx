import Link from "next/link";
import type { Metadata } from "next";
import { DocsShell, PrevNext } from "../_components/docs-shell";

export const metadata: Metadata = {
  title: "Agent API — GapSmith",
  description: "x402-paid Solana USDC API for AI agents. Pay-per-call market intelligence and on-demand venture pipelines.",
};

/* Solana ecosystem accent → Workshop palette (Patina + Ember).
   Names preserved so `${SOLANA_PURPLE}40` hex-alpha patterns stay valid. */
const SOLANA_PURPLE = "#3db5a6"; // Patina
const SOLANA_GREEN = "#d4743c";  // Ember
const SOLANA_GRADIENT = `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`;
const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const CODE_BG = "oklch(0.97 0.005 80)";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      className="overflow-x-auto rounded-lg p-4 text-xs leading-relaxed"
      style={{ background: "#0a0a0a", color: "#e8e8e8", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      <code>{children}</code>
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 text-[0.85em] font-mono"
      style={{ background: CODE_BG, color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
    >
      {children}
    </code>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12">
      <h2 className="font-heading text-2xl font-bold tracking-tight" style={{ color: FG, letterSpacing: "-1px" }}>
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function EndpointRow({
  method,
  path,
  price,
  description,
}: {
  method: "GET" | "POST";
  path: string;
  price: string;
  description: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg p-4 sm:flex-row sm:items-center sm:gap-4"
      style={{ background: CODE_BG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
    >
      <span
        className="inline-block w-fit rounded px-2 py-0.5 text-xs font-bold"
        style={{ background: method === "GET" ? "#10b981" : "#3b82f6", color: "white" }}
      >
        {method}
      </span>
      <code className="font-mono text-sm" style={{ color: FG }}>
        {path}
      </code>
      <span className="text-xs font-medium ml-auto" style={{ color: SOLANA_PURPLE }}>
        {price}
      </span>
      <span className="text-xs sm:hidden" style={{ color: MUTED }}>
        {description}
      </span>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <DocsShell active="/docs/api">
      <>
        {/* Hero */}
        <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: `linear-gradient(135deg, ${SOLANA_PURPLE}10, ${SOLANA_GREEN}10)`, boxShadow: `0 0 0 1px ${SOLANA_PURPLE}30` }}>
          <span style={{ background: SOLANA_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ✨ Agent API
          </span>
        </div>
        <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight md:text-5xl"
          style={{ color: FG, letterSpacing: "-1.5px" }}>
          AI agents pay AI agents.
        </h1>
        <p className="mt-4 text-base leading-relaxed" style={{ color: MUTED }}>
          GapSmith&apos;s venture intelligence is callable by other AI agents over standard
          HTTPS. Pay per call with USDC on Solana via the{" "}
          <a href="https://docs.cdp.coinbase.com/x402" target="_blank" rel="noopener noreferrer"
            className="underline" style={{ color: SOLANA_PURPLE }}>
            x402 protocol
          </a>
          {" "}— no API keys, no signups, no chargebacks. Settlement in ~2 seconds.
        </p>

        {/* Quick links */}
        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          <a href="#quickstart" className="rounded-full px-3 py-1" style={{ background: CODE_BG, color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}>Quickstart</a>
          <a href="#flow" className="rounded-full px-3 py-1" style={{ background: CODE_BG, color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}>x402 flow</a>
          <a href="#endpoints" className="rounded-full px-3 py-1" style={{ background: CODE_BG, color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}>Endpoints</a>
          <a href="#async" className="rounded-full px-3 py-1" style={{ background: CODE_BG, color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}>Async jobs</a>
          <a href="/api/v1/openapi" className="rounded-full px-3 py-1" style={{ background: CODE_BG, color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}>OpenAPI spec ↗</a>
        </div>

        {/* Quickstart */}
        <Section id="quickstart" title="Quickstart">
          <p style={{ color: MUTED, lineHeight: 1.65 }}>
            Five-line Python — agent pays 0.10 USDC, gets the latest market gaps for
            an AI/ML sector:
          </p>
          <CodeBlock>{`# pip install solana solders requests
from agent_demo import x402_get  # see examples/agent_demo.py

resp = x402_get("https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml",
                wallet_secret_key=YOUR_PRIVATE_KEY_BYTES)
print(resp.json())  # → { gaps: [...], count: N, generatedFrom: "2026-..." }`}</CodeBlock>
          <p className="text-xs" style={{ color: MUTED }}>
            Reference implementation: <InlineCode>agent_demo.py</InlineCode> — self-contained,
            ~150 lines. Request a copy at{" "}
            <Link href="/contact" className="underline" style={{ color: SOLANA_PURPLE }}>
              /contact
            </Link>
            .
          </p>
        </Section>

        {/* What model runs your call */}
        <Section id="model-tier" title="What model runs your call">
          <p style={{ color: MUTED, lineHeight: 1.65 }}>
            All <InlineCode>/api/v1/*</InlineCode> endpoints run on a{" "}
            <strong style={{ color: FG }}>cost-effective LLM tier</strong> (MiniMax M2.7 /
            Claude Sonnet 4.6 class). That&apos;s what makes per-call pricing in the
            $0.05–$15 range sustainable — we&apos;re not running every probe on Opus 4.7.
          </p>
          <div
            className="rounded-lg p-4"
            style={{ background: CODE_BG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
              Why this design
            </div>
            <ul className="mt-2 space-y-1.5 pl-5 text-sm list-disc" style={{ color: FG, lineHeight: 1.5 }}>
              <li>
                <strong>Quality stays high</strong> — Sonnet 4.6 / MiniMax M2.7 produce
                venture-grade Scout output (verified at parity with Opus on the same Scout
                brief).
              </li>
              <li>
                <strong>Pricing stays predictable</strong> — agent operators can budget
                per-call cost without worrying about which model rolled the dice today.
              </li>
              <li>
                <strong>Latency stays low</strong> — sync endpoints settle in seconds; the
                async Compute API ({" "}<InlineCode>/forge/ideate</InlineCode>) returns within ~30 min.
              </li>
            </ul>
          </div>
          <p style={{ color: MUTED, lineHeight: 1.65 }}>
            <strong style={{ color: FG }}>Need top-tier output?</strong> The{" "}
            <Link href="/docs/done-for-you" className="underline" style={{ color: SOLANA_PURPLE }}>
              Done-For-You service
            </Link>{" "}
            runs the same pipelines on Claude Opus 4.7 / GPT-5.5 Pro with human review. Slower
            and pricier ($39 / $99 / $149 per run, 24-72 hours), but built for the moments
            where you ship the report to a customer or investor.
          </p>
        </Section>

        {/* x402 flow */}
        <Section id="flow" title="The x402 flow">
          <p style={{ color: MUTED, lineHeight: 1.65 }}>
            Three round trips — but the second is on-chain, not HTTP:
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-sm" style={{ color: FG }}>
            <li>
              <strong>Probe:</strong> Agent makes the request without payment. Server returns{" "}
              <InlineCode>HTTP 402 Payment Required</InlineCode> with a JSON body listing
              acceptable payment options (recipient, amount, mint, network).
            </li>
            <li>
              <strong>Settle:</strong> Agent constructs an SPL{" "}
              <InlineCode>transferChecked</InlineCode> instruction sending the required
              USDC to our merchant ATA, signs with its own Solana wallet, and submits
              to the network. Wait for confirmation (~2s).
            </li>
            <li>
              <strong>Redeem:</strong> Agent retries the same request with{" "}
              <InlineCode>X-PAYMENT</InlineCode> header containing the transaction
              signature. Server verifies on-chain, then returns the resource.
            </li>
          </ol>

          <h3 className="font-heading text-lg font-bold mt-6" style={{ color: FG }}>
            402 response body
          </h3>
          <CodeBlock>{`HTTP/1.1 402 Payment Required
Content-Type: application/json
x402-version: 1

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "solana",
    "maxAmountRequired": "100000",        // atomic units (USDC has 6 decimals)
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "payTo": "DtESM4kaLx6Kjxz5oTKwv4AxkkEbsphHcMJXV4ShRrZ5",
    "resource": "https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml",
    "description": "Scout market gap intelligence — aggregated from recent multi-agent scans",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60
  }],
  "error": "Payment required..."
}`}</CodeBlock>

          <h3 className="font-heading text-lg font-bold mt-6" style={{ color: FG }}>
            X-PAYMENT header format
          </h3>
          <p style={{ color: MUTED, lineHeight: 1.65 }}>
            Base64-encoded JSON. Raw JSON also accepted (for ergonomic curl testing).
          </p>
          <CodeBlock>{`{
  "x402Version": 1,
  "scheme": "exact",
  "network": "solana",      // or "solana-devnet"
  "payload": {
    "txSignature": "<base58-encoded tx signature>"
  }
}`}</CodeBlock>

          <h3 className="font-heading text-lg font-bold mt-6" style={{ color: FG }}>
            Devnet for testing
          </h3>
          <p style={{ color: MUTED, lineHeight: 1.65 }}>
            Append <InlineCode>?network=devnet</InlineCode> to any endpoint URL to
            negotiate payment in <strong>devnet USDC</strong> instead of mainnet.
            The 402 response will include the devnet USDC mint, devnet merchant ATA,
            and the X-PAYMENT must reference a devnet tx. Mainnet is the default
            (no param needed) for production agent traffic.
          </p>
          <CodeBlock>{`# Test for free with devnet USDC (faucet.circle.com)
curl -i "https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml&network=devnet"

# Switch to mainnet for real agents (default)
curl -i "https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml"`}</CodeBlock>

          <h3 className="font-heading text-lg font-bold mt-6" style={{ color: FG }}>
            Idempotency
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: FG }}>
            <li>Same <InlineCode>tx_hash</InlineCode> on the same endpoint → returns cached response (sync) or 409 (async)</li>
            <li>Same <InlineCode>tx_hash</InlineCode> on a different endpoint → 400 rejection (proof was for another resource)</li>
            <li>Wrong amount → 400 amount mismatch</li>
            <li>Wrong mint (e.g. USDT instead of USDC) → 400 mint mismatch</li>
          </ul>
        </Section>

        {/* Endpoints */}
        <Section id="endpoints" title="Endpoints">
          <h3 className="font-heading text-lg font-bold" style={{ color: FG }}>
            Data API · synchronous · cache-only
          </h3>
          <p className="text-sm" style={{ color: MUTED, lineHeight: 1.6 }}>
            Pre-aggregated market intelligence from recent Scout runs. Returns in &lt;1 second.
            Ideal for AI agents querying market data at scale.
          </p>
          <div className="space-y-2">
            <EndpointRow method="GET" path="/api/v1/scout/gaps" price="0.10 USDC" description="Market gap intelligence" />
            <EndpointRow method="GET" path="/api/v1/scout/pain-clusters" price="0.10 USDC" description="Pain themes from real complaints" />
            <EndpointRow method="GET" path="/api/v1/scout/trends" price="0.10 USDC" description="Emerging market signals" />
            <EndpointRow method="GET" path="/api/v1/scout/keywords" price="0.05 USDC" description="Top keywords by occurrence" />
          </div>
          <p className="text-xs" style={{ color: MUTED }}>
            All accept <InlineCode>?sector=</InlineCode> filter and{" "}
            <InlineCode>?limit=</InlineCode> cap.{" "}
            <InlineCode>/trends</InlineCode> also takes <InlineCode>?days=</InlineCode>.
          </p>

          <h3 className="font-heading text-lg font-bold mt-6" style={{ color: FG }}>
            Discovery — call free first
          </h3>
          <div className="space-y-2">
            <EndpointRow method="GET" path="/api/v1/sectors" price="free" description="List which sectors have cached data (call before paid endpoints)" />
          </div>
          <p className="text-xs" style={{ color: MUTED }}>
            Data API responses are filtered from cached Scout runs. If you query{" "}
            <InlineCode>?sector=fintech</InlineCode> but only{" "}
            <InlineCode>ai-ml</InlineCode> + <InlineCode>healthtech</InlineCode> are cached,
            you&apos;ll pay USDC and get an empty array. Hit{" "}
            <InlineCode>/api/v1/sectors</InlineCode> first (free) to see what&apos;s available.
          </p>

          <h3 className="font-heading text-lg font-bold mt-8" style={{ color: FG }}>
            Compute API · async · runs full pipeline
          </h3>
          <p className="text-sm" style={{ color: MUTED, lineHeight: 1.6 }}>
            Triggers a real multi-agent pipeline. Returns <InlineCode>202 Accepted</InlineCode>{" "}
            + jobId immediately; agent polls <InlineCode>/api/v1/jobs/{`{id}`}</InlineCode>{" "}
            until completion or supplies a <InlineCode>webhook_url</InlineCode> for push delivery.
          </p>
          <div className="space-y-2">
            <EndpointRow method="POST" path="/api/v1/forge/ideate" price="15 USDC" description="Run a 5-round multi-agent brainstorm (~30 min)" />
          </div>

          <h3 className="font-heading text-lg font-bold mt-8" style={{ color: FG }}>
            Job management · free
          </h3>
          <div className="space-y-2">
            <EndpointRow method="GET" path="/api/v1/jobs/{jobId}" price="free" description="Poll async job status" />
          </div>
          <p className="text-xs" style={{ color: MUTED }}>
            Free because <InlineCode>jobId</InlineCode> already encodes the capability —
            knowing the id implies you paid for it.
          </p>
        </Section>

        {/* Async pattern */}
        <Section id="async" title="Async job pattern">
          <p style={{ color: MUTED, lineHeight: 1.65 }}>
            Compute API endpoints can take 10-45 minutes. We don&apos;t hold an HTTP
            connection that long — instead:
          </p>
          <CodeBlock>{`# 1. Pay + dispatch
resp = x402_post("https://.../api/v1/forge/ideate", body={
    "sectors": ["ai-ml"],
    "context": "Find SaaS gaps in agent observability tooling",
    "webhook_url": "https://my-agent.com/forge-callback"   # optional
})
# resp.status_code == 202
job = resp.json()
# { "jobId": "fg_abc123", "statusUrl": "/api/v1/jobs/fg_abc123", "etaMinutes": 35 }

# 2. Poll (free, no payment needed)
import time
while True:
    s = requests.get(f"https://gapsmith.draftlabs.org/api/v1/jobs/{job['jobId']}").json()
    if s["status"] == "completed":
        print(s["result"])
        break
    if s["status"] == "failed":
        raise RuntimeError(s["error"])
    time.sleep(60)

# 3. (Optional) Webhook delivery
# If you set webhook_url, we POST to it with HMAC-signed body.
# Header: x-gapsmith-signature: <hex(hmac_sha256(secret, body))>
# Body: { "jobId": "fg_abc123", "status": "completed", "result": {...} }`}</CodeBlock>
          <h3 className="font-heading text-lg font-bold mt-6" style={{ color: FG }}>
            Job statuses
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>
                <th className="pb-2 text-left">Status</th>
                <th className="pb-2 text-left">Meaning</th>
              </tr>
            </thead>
            <tbody style={{ color: FG }}>
              <tr className="border-t" style={{ borderColor: BORDER }}>
                <td className="py-2"><InlineCode>pending</InlineCode></td>
                <td>Payment verified, awaiting dispatch (usually &lt;5s)</td>
              </tr>
              <tr className="border-t" style={{ borderColor: BORDER }}>
                <td className="py-2"><InlineCode>running</InlineCode></td>
                <td>Pipeline executing. Check <InlineCode>progressPct</InlineCode> for ETA</td>
              </tr>
              <tr className="border-t" style={{ borderColor: BORDER }}>
                <td className="py-2"><InlineCode>completed</InlineCode></td>
                <td>Result populated in <InlineCode>result</InlineCode> field</td>
              </tr>
              <tr className="border-t" style={{ borderColor: BORDER }}>
                <td className="py-2"><InlineCode>failed</InlineCode></td>
                <td>Error in <InlineCode>error</InlineCode> field. Refunds via support.</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* Why x402 / Solana */}
        <Section title="Why x402 + Solana?">
          <ul className="list-disc space-y-2 pl-5 text-sm" style={{ color: FG }}>
            <li>
              <strong>Stable pricing</strong> — USDC is 1:1 with USD, no FX or volatility.
              0.10 USDC always means $0.10.
            </li>
            <li>
              <strong>Sub-cent settlement fees</strong> — Solana network fees are ~0.000005 SOL
              (&lt;$0.001 at typical SOL prices). The whole API economics rely on Solana&apos;s
              low fees being lower than the smallest amount worth charging.
            </li>
            <li>
              <strong>Standard HTTP semantics</strong> — Nothing custom. Any HTTP client,
              any language, can call this API. No SDK lock-in.
            </li>
            <li>
              <strong>No chargebacks</strong> — On-chain settlement is final. Agents can
              spend confidently, sellers don&apos;t deal with disputes.
            </li>
            <li>
              <strong>Designed for autonomous agents</strong> — No signup, no account, no
              API key rotation. The agent&apos;s own wallet IS its identity. Coinbase
              and Anthropic explicitly designed x402 for this use case.
            </li>
          </ul>
        </Section>

        {/* Footer */}
        <div className="mt-16 border-t pt-8 text-sm" style={{ borderColor: BORDER, color: MUTED }}>
          <p>
            Building an agent? Request the <InlineCode>agent_demo.py</InlineCode> reference
            implementation via{" "}
            <Link href="/contact" className="underline" style={{ color: SOLANA_PURPLE }}>
              /contact
            </Link>
            . Questions: <a href="mailto:gapsmith@draftlabs.org" className="underline">gapsmith@draftlabs.org</a>.
          </p>
          <p className="mt-2 text-xs">
            <Link href="/" className="underline">← Back to GapSmith</Link>
            {" · "}
            <Link href="/pricing" className="underline">Pricing</Link>
            {" · "}
            <a href="https://solscan.io/account/BuBjMDp2B9dPxFHjWU4qWZBQKKWkAXoiPts2GWGN9Rbv"
              target="_blank" rel="noopener noreferrer" className="underline">
              Merchant wallet ↗
            </a>
          </p>
        </div>

        <PrevNext prev={{ href: "/docs/x402", label: "x402 on Solana" }} />
      </>
    </DocsShell>
  );
}
