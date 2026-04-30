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
  OL,
  CodeBlock,
  InlineCode,
  PrevNext,
  DOCS_TOKENS,
} from "../_components/docs-shell";

export const metadata: Metadata = {
  title: "Quickstart — GapSmith Docs",
  description: "Sign up, buy a tier, and run your first Scout / Forge / Prove pipeline in 5 minutes.",
};

export default function Quickstart() {
  const { ACCENT } = DOCS_TOKENS;

  return (
    <DocsShell active="/docs/quickstart">
      <DocsHero
        eyebrow="Quickstart"
        title="From zero to first report in 5 minutes."
        subtitle="There are two ways to use GapSmith: as a human via the webapp, or as an autonomous agent via the Agent API. This page covers both."
      />

      <Takeaway>
        Buy <strong>Scout</strong> ($4.90 lifetime), drop in your LLM API key, pick 3 sectors,
        and you&apos;ll have your first market gap report in ~6 minutes for ~$1.50 of model
        spend (your key, your cost).
      </Takeaway>

      <H2>For humans (web app)</H2>

      <H3>1. Create an account</H3>
      <P>
        Sign up with Google OAuth or email at{" "}
        <Link href="/signup" className="underline" style={{ color: ACCENT }}>
          /signup
        </Link>
        . Email is auto-verified for Google sign-in; magic-link is sent for email signup.
      </P>

      <H3>2. Buy a tier</H3>
      <P>
        Pricing follows a bonding curve — earlier buyers pay less. Two payment rails:
      </P>
      <UL>
        <li>
          <strong>USDC on Solana</strong> (primary, recommended) — Click <em>Pay 4.90 USDC</em>,
          approve in Phantom, ~3 second settlement.
        </li>
        <li>
          <strong>Card</strong> via Stripe — same price, demoted to a text link.
        </li>
      </UL>
      <MutedP>
        Each purchase comes with an annual usage quota (12 Scout runs / 6 Forge sessions /
        4 Prove debates) that resets every 365 days from the purchase date. Run out? Order
        a Done-For-You report instead — Claude Opus + human-reviewed.
      </MutedP>

      <H3>3. Add your LLM API key</H3>
      <P>
        GapSmith is BYOK — your API costs go directly to your provider, not to us. Drop a
        key into{" "}
        <Link href="/settings" className="underline" style={{ color: ACCENT }}>
          /settings
        </Link>
        . Anthropic, OpenAI, Google Gemini, and MiniMax are supported. You can save one
        key per provider — the run page picks the right one based on the model you choose.
      </P>

      <H3>4. Run Scout</H3>
      <P>
        Pick up to 10 industry sectors (AI/ML, SaaS, Fintech, etc.), pick a model (start
        with <InlineCode>claude-sonnet-4-6</InlineCode> or <InlineCode>MiniMax-M2.7</InlineCode> for the
        balanced default), and click <em>Get Scout</em>. Progress streams to the page in
        real time. Output:
      </P>
      <UL>
        <li>Daily brief synthesizing 70+ articles + 250+ pain signals</li>
        <li>3 venture-grade topics with concrete wedges + competitor pricing</li>
        <li>10 pain clusters mapped to sector + frequency</li>
        <li>10 cross-signals linking news → pain → startup opportunity</li>
      </UL>

      <H3>5. (Optional) Pipe into Forge & Prove</H3>
      <P>
        On the Scout report page, click <em>Forge this report</em> to run 5-round multi-agent
        ideation against the gaps. Or hand-pick an idea and click <em>Prove</em> for a multi-round
        adversarial debate (up to 4 rounds) with kill votes, RICE scoring, and pivot detection.
      </P>

      <H2>For agents (programmatic)</H2>

      <P>
        AI agents call our endpoints under x402 — pay-per-request in USDC, no API key, no
        signup. Quick smoke-test against devnet:
      </P>

      <CodeBlock lang="bash">{`# Install x402 client deps
pip install solders solana requests base58

# Point at your devnet wallet (or request a test wallet from us)
export AGENT_WALLET_SECRET="<your-base58-secret>"

# Run the reference demo — pays ~$0.55 devnet USDC across 5 endpoints
python agent_demo.py --skip-compute`}</CodeBlock>
      <MutedP>
        The full reference implementation is ~80 lines — request a copy via{" "}
        <a href="/contact" className="underline" style={{ color: ACCENT }}>/contact</a>{" "}
        if you&apos;d like to skip writing the x402 client yourself.
      </MutedP>

      <MutedP>
        Each endpoint follows the standard x402 dance: probe (no payment) → 402 with
        payment requirements → sign Solana SPL transferChecked → resubmit with{" "}
        <InlineCode>X-Payment</InlineCode> header → 200 with JSON. Same code path on mainnet.
      </MutedP>

      <H3>Minimum 3-line client</H3>
      <CodeBlock lang="python">{`from gapsmith_x402 import probe_pay_get  # ~80 lines, see examples/agent_demo.py

resp = probe_pay_get(
    "https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml",
    wallet_secret=os.environ["AGENT_WALLET_SECRET"],
    network="mainnet",
)
print(resp.json()["gaps"][:3])`}</CodeBlock>

      <H2>What to read next</H2>
      <UL>
        <li>
          <Link href="/docs/architecture" className="underline" style={{ color: ACCENT }}>
            Architecture
          </Link>{" "}
          — system overview, where each piece runs, how data flows
        </li>
        <li>
          <Link href="/docs/pipelines" className="underline" style={{ color: ACCENT }}>
            Pipelines
          </Link>{" "}
          — what Scout / Forge / Prove actually do, with cost + quality benchmarks
        </li>
        <li>
          <Link href="/docs/x402" className="underline" style={{ color: ACCENT }}>
            x402 on Solana
          </Link>{" "}
          — how the payment protocol works, why we picked it, idempotency design
        </li>
        <li>
          <Link href="/docs/api" className="underline" style={{ color: ACCENT }}>
            Agent API reference
          </Link>{" "}
          — every endpoint, parameter, error code
        </li>
      </UL>

      <PrevNext
        prev={{ href: "/docs", label: "Overview" }}
        next={{ href: "/docs/architecture", label: "Architecture" }}
      />
    </DocsShell>
  );
}
