/**
 * Shared LLM model catalog. Source of truth for the model dropdowns on
 * /scout, /forge, /prove, /lab/debate-room. Settings page has its own
 * richer ProviderInfo (with key prefix, accent colors, etc.) used for
 * the BYOK setup screen — that one will eventually be refactored to
 * derive from this catalog, but for now the two coexist.
 */

export type ProviderId = "anthropic" | "openai" | "google" | "minimax";

export interface ModelEntry {
  id: string;
  name: string;
  provider: ProviderId;
  inputCostPer1k: number;
  outputCostPer1k: number;
  /** Rough hint for users picking a Prove-ready model. Higher = more
   *  reasoning capacity at the cost of dollars/round. */
  tier: "frontier" | "strong" | "fast" | "mini";
}

// Mirrors src/app/settings/page.tsx PROVIDERS catalog. Keep in sync —
// when you add a new model, add it here AND in settings.
export const ALL_MODELS: ModelEntry[] = [
  // Anthropic
  { id: "claude-opus-4-7",      name: "Claude Opus 4.7",      provider: "anthropic", inputCostPer1k: 0.015,  outputCostPer1k: 0.075,  tier: "frontier" },
  { id: "claude-opus-4-6",      name: "Claude Opus 4.6",      provider: "anthropic", inputCostPer1k: 0.015,  outputCostPer1k: 0.075,  tier: "frontier" },
  { id: "claude-sonnet-4-6",    name: "Claude Sonnet 4.6",    provider: "anthropic", inputCostPer1k: 0.003,  outputCostPer1k: 0.015,  tier: "strong" },
  // OpenAI
  { id: "gpt-5.5-pro",          name: "GPT-5.5 Pro",          provider: "openai",    inputCostPer1k: 0.030,  outputCostPer1k: 0.180,  tier: "frontier" },
  { id: "gpt-5.5",              name: "GPT-5.5",              provider: "openai",    inputCostPer1k: 0.005,  outputCostPer1k: 0.030,  tier: "strong" },
  { id: "gpt-5.4-pro",          name: "GPT-5.4 Pro",          provider: "openai",    inputCostPer1k: 0.030,  outputCostPer1k: 0.180,  tier: "frontier" },
  { id: "gpt-5.4",              name: "GPT-5.4",              provider: "openai",    inputCostPer1k: 0.0025, outputCostPer1k: 0.015,  tier: "strong" },
  { id: "gpt-5.4-mini",         name: "GPT-5.4 Mini",         provider: "openai",    inputCostPer1k: 0.00075, outputCostPer1k: 0.0045, tier: "fast" },
  { id: "gpt-5.4-nano",         name: "GPT-5.4 Nano",         provider: "openai",    inputCostPer1k: 0.0002, outputCostPer1k: 0.00125, tier: "mini" },
  // Google
  { id: "gemini-3.1-pro-preview",        name: "Gemini 3.1 Pro (preview)",        provider: "google", inputCostPer1k: 0.002,   outputCostPer1k: 0.012,  tier: "frontier" },
  { id: "gemini-3-flash-preview",        name: "Gemini 3 Flash (preview)",        provider: "google", inputCostPer1k: 0.0005,  outputCostPer1k: 0.003,  tier: "fast" },
  { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash-Lite (preview)", provider: "google", inputCostPer1k: 0.00025, outputCostPer1k: 0.0015, tier: "mini" },
  { id: "gemini-2.5-pro",                name: "Gemini 2.5 Pro",                  provider: "google", inputCostPer1k: 0.00125, outputCostPer1k: 0.01,   tier: "strong" },
  { id: "gemini-2.5-flash",              name: "Gemini 2.5 Flash",                provider: "google", inputCostPer1k: 0.0003,  outputCostPer1k: 0.0025, tier: "fast" },
  { id: "gemini-2.5-flash-lite",         name: "Gemini 2.5 Flash-Lite",           provider: "google", inputCostPer1k: 0.0001,  outputCostPer1k: 0.0004, tier: "mini" },
  // MiniMax
  { id: "MiniMax-M1",      name: "MiniMax-M1",      provider: "minimax", inputCostPer1k: 0.002,  outputCostPer1k: 0.008,  tier: "strong" },
  { id: "MiniMax-M2.5",    name: "MiniMax-M2.5",    provider: "minimax", inputCostPer1k: 0.0015, outputCostPer1k: 0.006,  tier: "strong" },
  { id: "MiniMax-M2.7",    name: "MiniMax-M2.7",    provider: "minimax", inputCostPer1k: 0.0015, outputCostPer1k: 0.006,  tier: "strong" },
  { id: "MiniMax-Text-01", name: "MiniMax-Text-01", provider: "minimax", inputCostPer1k: 0.0004, outputCostPer1k: 0.0016, tier: "fast" },
];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic / Claude",
  openai: "OpenAI / GPT",
  google: "Google / Gemini",
  minimax: "MiniMax",
};

/** Find a model entry by its id. Returns null if unknown. */
export function getModelById(id: string): ModelEntry | null {
  return ALL_MODELS.find(m => m.id === id) ?? null;
}

/** Estimate per-persona cost for a Prove-style debate.
 *  Very rough: ~5 calls per persona × ~6K input + ~2K output tokens average.
 *  Used for the cost preview in /lab/debate-room/new. */
export function estimatePersonaCostUsd(modelId: string): number {
  const m = getModelById(modelId);
  if (!m) return 0;
  const calls = 5;
  const inputK = 6;   // 6K input tokens per call
  const outputK = 2;  // 2K output tokens per call
  return calls * (inputK * m.inputCostPer1k + outputK * m.outputCostPer1k);
}
