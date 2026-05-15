export const VARIANTS = [
  {
    slug: "full-pipeline",
    headline: "From Market Signal to Validated Startup Idea in 2 Hours",
    subheadline:
      "AI agents scan trends, brainstorm ideas, then debate and stress-test them — so you don't waste months on bad bets.",
    cta: "Start Free Trial",
    promise:
      "Stop guessing. Let a panel of AI agents argue about your idea before you build it.",
    proof:
      "Multi-agent pipeline shipped on Solana mainnet — pay-per-call via x402, callable by AI agents directly.",
    urgency:
      "Every day you don't validate is a day you might be building the wrong thing",
    painPoints: [
      "Manually scanning Reddit, HN, and news for startup ideas takes weeks",
      "No structured way to know if an idea is worth pursuing",
      "Existing validators give shallow, single-AI reports — not real debate",
    ],
  },
  {
    slug: "byok-value",
    headline: "Your API Key. Your Ideas. One-Time Price.",
    subheadline:
      "No subscriptions. No per-report fees. Buy once, validate forever with your own LLM.",
    cta: "Get Lifetime Access",
    promise:
      "The only startup validator that costs you nothing to run — just your API key",
    proof: "Full pipeline costs $6-13 per run with GPT-4.1 or Gemini",
    urgency:
      "Price goes up with every purchase — early buyers get the best deal",
    painPoints: [
      "Subscription fatigue — another $29/month tool you'll cancel in 2 months",
      "Per-report pricing adds up fast when you're exploring multiple ideas",
      "You're already paying for AI API access — why pay again?",
    ],
  },
] as const;

export type VariantSlug = (typeof VARIANTS)[number]["slug"];

export const DEFAULT_VARIANT = VARIANTS[0];

export function getVariant(slug: string) {
  return VARIANTS.find((v) => v.slug === slug);
}

export function getVariantSlugs(): string[] {
  return VARIANTS.map((v) => v.slug);
}
