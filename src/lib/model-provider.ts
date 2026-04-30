/**
 * Map an LLM model id (as set on /scout, /forge, /prove run pages) to its
 * provider key in the api_keys table. Used by start routes to pick the
 * right BYOK row when the user has multiple keys saved.
 */
export type Provider = "anthropic" | "openai" | "google" | "deepseek" | "minimax" | "qwen" | "xai";

export function inferProviderFromModel(model: string | null | undefined): Provider | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.startsWith("claude") || m.startsWith("sonnet") || m.startsWith("opus") || m.startsWith("haiku")) {
    return "anthropic";
  }
  if (m.startsWith("gpt") || m === "o1" || m === "o3" || m.startsWith("o3-") || m.startsWith("o1-")) {
    return "openai";
  }
  if (m.startsWith("gemini")) return "google";
  if (m.startsWith("grok")) return "xai";
  if (m.startsWith("deepseek")) return "deepseek";
  if (m.startsWith("minimax")) return "minimax";
  if (m.startsWith("qwen")) return "qwen";
  return null;
}
