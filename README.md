# GapSmith

**An AI venture builder where AI agents pay AI agents.**

GapSmith runs three multi-agent pipelines — **Scout** (market signal scanning), **Forge** (5-round idea brainstorming), **Prove** (multi-agent debate stress-testing) — and exposes that intelligence to other AI agents over standard HTTPS via the **x402 payment protocol**. Every API call settles in USDC on Solana mainnet in under 2 seconds. No API keys, no signups: the wallet is the identity.

- 🌐 Live: https://gapsmith.draftlabs.org
- 📖 API docs: https://gapsmith.draftlabs.org/docs/api · [Playground](https://gapsmith.draftlabs.org/docs/api/playground)
- 🧪 Lab: [Debate Room (WIP)](https://gapsmith.draftlabs.org/lab/debate-room) — visualize a real Prove session
- 📰 [Changelog](https://gapsmith.draftlabs.org/changelog) — what shipped this week
- 📜 OpenAPI: https://gapsmith.draftlabs.org/api/v1/openapi
- 🎬 Pitch video: <!-- LINK_TO_EXISTING_PITCH_VIDEO --> _(linked from Colosseum submission)_

> Submitted to **Solana Frontier Hackathon 2026** by Colosseum.

---

## Project context

GapSmith is a project of **DraftLabs**, a small team. The project is currently led solo by the project lead, who is allocating time during a deliberate evaluation phase. The project lead converts to full-time and DraftLabs activates additional contributors on a clear traction signal — hackathon win or organic agent-API revenue. Capital-efficient by intention, with a concrete commitment trigger rather than vague over-promising.

For team background and motivation, see the **pitch video** linked above (submitted with the Colosseum application).

Contact: <!-- project-lead-email --> · GitHub: <!-- github-handle -->

## Why this exists

We've been validating SaaS ideas internally and keep hitting the same wall: getting an honest second opinion on whether an idea is worth building. Forums are noisy, friends are polite, AI assistants are sycophantic by training. So we built the panel of skeptics we wished we had — six adversarial AI personas (Proposer / Challenger / Analyst / Defender / Reviewer / Strategist) that pressure-test an idea across multiple search-augmented rounds and emit a verdict with concrete reasoning.

Then we made it pay-per-call so other AI agents can use it too. That's the second reason: AI agents are starting to commission real research, and they need the same honest, auditable, on-chain-billable analysis humans get from consultants. GapSmith is what we'd deploy internally for our own venture decisions — making it public makes it sharper.

## Where this goes (10-year vision)

AI agents will commission research and validation the way humans commission consultants. GapSmith is the venture-decision layer of that economy — the place agents go to get honest, paid analysis before committing capital, and the place humans go to outsource the "is this worth my time" question with audit trails attached. By the time agentic commerce is mainstream, running a startup-validation debate without a panel like this should feel like running a software business without code review.

## What's live today

- **Mainnet** at [gapsmith.draftlabs.org](https://gapsmith.draftlabs.org) — Stripe + USDC payments via Phantom, all 3 pipelines callable
- **3 paid pipelines** — Scout (data, $0.10–0.20/call, sync), Forge (compute, $15/call, ~35 min), Prove (compute, $25/call, ~60 min)
- **x402 protocol on Solana** — production implementation with SPL transferChecked + memo binding for idempotency
- **Public on-chain traction** — verifiable on the [merchant wallet](https://solscan.io/account/BuBjMDp2B9dPxFHjWU4qWZBQKKWkAXoiPts2GWGN9Rbv), shown live on the homepage hero
- **80-line reference agent** — `examples/agent_demo.py` — ephemeral wallet, 402 → pay → resubmit, polls Compute jobs to completion
- **Visual debate room** — [/lab/debate-room](https://gapsmith.draftlabs.org/lab/debate-room) — Microsoft-Teams-style replay of a real Prove session (mainnet, no payment to view)
- **Active build log** — [/changelog](https://gapsmith.draftlabs.org/changelog) — daily ship notes during the hackathon review window

---

## What it does

### For humans (web app)

Three products bought as lifetime access tiers (bonding-curve priced):

| Product | What it does | Output |
|---------|--------------|--------|
| **Scout** | Multi-agent scan over RSS + community pain sources, ranks gaps and pain clusters by sector | Daily executive brief, gap list, pain clusters, trends, keywords |
| **Forge** | 5-round Proposer-vs-Defender brainstorm grounded in a Scout report or freeform context | Top 3 ideas, each with RICE + Kill scores, full round transcript |
| **Prove** | Multi-agent debate (6 personas) that stress-tests a single idea | Verdict (proceed / pivot / kill) with consensus reasoning |

Payment: Stripe (card) or Phantom (USDC on Solana) at `/pricing`. Each tier comes with a 365-day rolling usage quota; beyond quota, users can upgrade to a Done-For-You tier ($39 / $99 / $149) that runs on Claude Opus with human review.

### For AI agents (programmatic API)

Same intelligence, exposed at `/api/v1/*`, paid per-call in USDC over x402.

| Tier | Endpoint | Cost | Mode |
|------|----------|------|------|
| Data API | `GET /api/v1/scout/gaps` | $0.10 USDC | sync, cached |
| Data API | `GET /api/v1/scout/pain-clusters` | $0.10 USDC | sync, cached |
| Data API | `GET /api/v1/scout/trends` | $0.10 USDC | sync, cached |
| Data API | `GET /api/v1/scout/keywords` | $0.05 USDC | sync, cached |
| Data API | `GET /api/v1/scout/brief` | $0.20 USDC | sync, cached (richest) |
| Compute API | `POST /api/v1/forge/ideate` | $15 USDC | async (~30 min) |
| Compute API | `POST /api/v1/prove/debate` | $25 USDC | async (~60 min) |
| Discovery | `GET /api/v1/sectors` | free | lists sectors with cached data |
| Jobs | `GET /api/v1/jobs/{jobId}` | free | poll async job status |

`POST /api/v1/forge/ideate` accepts an optional structured `session_config`
({ `profile`, `budget`, `timeline`, `revenue_threshold`, `founder_signal` }
with enum-validated values — see the [OpenAPI spec](https://gapsmith.draftlabs.org/api/v1/openapi))
so agents can calibrate the brainstorm to their own constraints rather than
defaulting to a generic Small Team / $10K / 4-8 weeks profile. Plain
SESSION_CONFIG.md strings are also accepted for backward compatibility.

**Flow:**
```
GET /api/v1/scout/gaps?sector=ai-ml
  → 402 Payment Required { accepts: [{ asset, payTo, maxAmountRequired, ... }] }
  → agent signs + sends SPL USDC transferChecked tx (~2s)
  → retry with X-PAYMENT: base64(JSON{ txSignature })
  → 200 OK { gaps, count, ... }
```

**No-burn safety**: any POST endpoint with a body validator returns 422
*before* the 402 advertisement when the body is malformed (wrong enum,
missing field, type mismatch). Agents can probe-test request shapes for
free; a 402 response is a positive signal that the body shape is OK and
the only thing left is to settle the USDC tx.

`tx_hash` is `UNIQUE` in `agent_jobs` for idempotency. Replays return the cached response (sync) or 409 (async). Compute API jobs accept an optional `webhook_url` — results POST back with an HMAC-SHA256 signature.

A self-contained Python reference implementation lives at [`examples/agent_demo.py`](examples/agent_demo.py).

---

## Architecture

```
┌──────────────────┐         ┌────────────────────┐
│  Next.js 16      │  HTTP   │  FastAPI Engine    │
│  (App Router)    │────────▶│  (Python)          │
│  Railway         │         │  Railway           │
└────────┬─────────┘         └─────────┬──────────┘
         │                             │
         │  Realtime + RLS             │  LLM via litellm
         ▼                             ▼  (Claude / GPT / Gemini /
┌──────────────────┐               DeepSeek / MiniMax / Qwen)
│  Supabase        │                   + Tavily (web search fallback)
│  (Postgres)      │
└──────────────────┘

┌──────────────────────────────────────────────────┐
│  Solana mainnet — USDC settlement (x402)         │
│  Phantom (human path) | server-to-server (agent) │
│  Helius RPC                                       │
└──────────────────────────────────────────────────┘
```

- **Frontend** — Next.js 16 (App Router), React 19, Tailwind 4, shadcn UI. Hosted on Railway.
- **Engine** — FastAPI (`engine/`) running multi-agent pipelines. Hosted on Railway. Uses `litellm` to abstract over LLM providers and `tavily-python` for web search when the model has no built-in search.
- **Storage** — Supabase (Postgres + Auth + Realtime + RLS). User LLM API keys are AES-256-GCM encrypted at rest (BYOK).
- **Payments** — Two rails:
  - Humans: Stripe (card) for lifetime access; Phantom (USDC) for the on-chain rail.
  - Agents: server-to-server x402 (no wallet adapter, just signing + memo binding).
- **Observability** — PostHog client + server.

### Data model (selected tables)

| Table | Purpose |
|-------|---------|
| `api_keys` | Per-user, per-provider encrypted LLM keys |
| `scout_reports` | Completed Scout runs (gaps, pain clusters, trends) |
| `forge_sessions` | Forge brainstorm rounds + top ideas |
| `prove_sessions` | Prove debate transcript + verdict |
| `purchases` | Stripe and x402 SKU purchases (lifetime access) |
| `purchase_counts` | Bonding-curve step counter per SKU |
| `usage_counters` | 365-day rolling usage counters |
| `agent_jobs` | Every paid x402 API call (`tx_hash UNIQUE` for idempotency, `jobId` as capability token for status polling) |
| `dfy_orders` | Done-For-You service orders |

---

## Local development

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- Python 3.11+ (for the engine)
- A Supabase project (or local `supabase start`)
- Optional: a Solana wallet with devnet USDC + SOL to test the x402 path

### Setup

```bash
# 1. Install Node deps
npm install

# 2. Install engine deps
cd engine && pip install -r requirements.txt && cd ..

# 3. Configure env
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY,
# STRIPE_SECRET_KEY, ENCRYPTION_SECRET, etc.

# 4. Apply migrations (auto-runs as `prebuild` too)
node scripts/auto-migrate.mjs

# 5. Run frontend
npm run dev
# → http://localhost:3000

# 6. Run engine (separate terminal)
uvicorn engine.api:app --host 0.0.0.0 --port 8000 --reload
```

### Required env vars

See [`.env.example`](.env.example) for the full list. Minimum:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `ENCRYPTION_SECRET` (`openssl rand -hex 32`)
- `RESEND_API_KEY`, `RESEND_FROM`
- For x402: `X402_MERCHANT_WALLET`, `SOLANA_RPC_URL` (server-side Helius URL), `NEXT_PUBLIC_SOLANA_RPC_URL` (browser-side Helius URL with origin restriction — Phantom pre-flight reads SOL/USDC balance via this), `SOL_NETWORK=devnet|mainnet`
- For pipelines: `TAVILY_API_KEY` (search fallback), plus user-supplied LLM keys via the in-app Settings page

### Tests

```bash
npm run test:flows    # vitest unit-ish flow tests
npm run test:e2e      # Playwright e2e
npm run test:e2e:ui   # Playwright with UI
npm run lint
```

---

## Trying the agent API

```bash
pip install solders solana spl-token requests base58

# Generate a fresh devnet wallet (script prints pubkey + airdrop instructions)
python examples/agent_demo.py

# Fund: airdrop SOL + faucet USDC, then run for real
python examples/agent_demo.py --secret-key <BASE58> --skip-compute

# Mainnet (real USDC)
python examples/agent_demo.py --mainnet --secret-key <BASE58>
```

The demo:
1. Hits each Data API endpoint at $0.10/call (~$0.40 total)
2. Triggers an async Forge brainstorm at $15
3. Polls `/api/v1/jobs/{jobId}` until completion

It's also importable as a 5-line library — see [`examples/README.md`](examples/README.md).

---

## Project layout

```
gapsmith/
├── src/
│   ├── app/
│   │   ├── api/                # Next.js route handlers
│   │   │   ├── v1/             # Public agent API (x402-gated)
│   │   │   ├── checkout/       # Human checkout (Stripe + x402)
│   │   │   ├── forge/, prove/, scout/   # Pipeline triggers (web app)
│   │   │   ├── order/dfy/      # Done-For-You orders
│   │   │   └── webhooks/       # Stripe + email
│   │   ├── pricing/, scout/, forge/, prove/   # Product pages
│   │   ├── docs/               # In-app docs (api, x402, pipelines, ...)
│   │   └── v/[variant]/        # Landing-page variants for A/B
│   ├── components/             # UI (shadcn, magicui, custom)
│   └── lib/
│       ├── x402.ts             # USDC verification, payment requests
│       ├── x402-server.ts      # 402 response builder
│       ├── x402-client.ts      # Phantom integration helpers
│       ├── crypto.ts           # AES-256-GCM for BYOK keys
│       ├── bonding-curve.ts    # Tier pricing math
│       └── ...
├── engine/                     # Python FastAPI service (Railway)
│   ├── api.py                  # HTTP entry; spawns background pipeline runs
│   ├── core/
│   │   ├── scout_runner.py
│   │   ├── ideation_runner.py  # Forge
│   │   ├── debate_runner.py    # Prove
│   │   ├── pain_fetcher.py, rss_fetcher.py
│   │   └── ...
│   └── adapters/               # litellm, supabase, tavily
├── supabase/
│   ├── config.toml
│   └── migrations/             # 015 migrations covering full schema
├── scripts/auto-migrate.mjs    # idempotent migration runner (wired into prebuild)
├── examples/agent_demo.py      # x402 reference impl (Python)
├── e2e/                        # Playwright suites
└── tests/flows.test.ts
```

---

## x402 protocol notes

GapSmith's implementation accepts the standard `accepts[]` shape with `scheme: "exact"`, networks `solana` (mainnet) and `solana-devnet`, and `X-PAYMENT` carrying base64-encoded JSON `{ x402Version, scheme, network, payload: { txSignature } }`. Both `transferChecked` and plain `transfer` SPL ops are accepted (Phantom emits either). The merchant ATA is created idempotently on first buy — first buyer pays ~0.002 SOL rent. Memos use `gapsmith:<userId>:<sku>:<paymentId>` for human flows and `x402:<resource>` for agent flows.

See [`src/lib/x402.ts`](src/lib/x402.ts) for the full verifier and [`src/lib/x402-server.ts`](src/lib/x402-server.ts) for the 402 response builder.

---

## Built for Colosseum Frontier 2026

Sponsor stack: Phantom (wallet), Helius (RPC), Coinbase CDP (x402 protocol), Solana mainnet.

## License

GapSmith is licensed under [AGPL-3.0](LICENSE). You may use, modify, and self-host the code freely; if you run a modified version as a network service, you must release your modifications under the same license.

A commercial license (no AGPL copyleft obligations) is available on request — contact gapsmith@draftlabs.org.
