/**
 * Lightweight parser for the SESSION_CONFIG.md markdown produced by
 * buildSessionConfig() on the Forge / Prove pages.
 *
 * The format is intentionally regular:
 *   # Session Config
 *   ## Project Profile
 *   Profile: Solo
 *   Budget: $1K
 *   Timeline: 3-6 months
 *   Revenue_threshold: $50K/year
 *   ## Founder Signal
 *   Signal: ...
 *
 * We don't try to be clever — just find the first `Key: value` line for
 * each known key. Anything we can't parse falls back to undefined.
 */

export interface ParsedSessionConfig {
  profile?: string;
  budget?: string;
  timeline?: string;
  revenueThreshold?: string;
  founderSignal?: string;
  /** Raw markdown — present even when no fields parse out, so callers can
   *  show "Custom" or "Other" sections without losing data. */
  raw: string;
}

export function parseSessionConfig(raw: string | null | undefined): ParsedSessionConfig {
  const out: ParsedSessionConfig = { raw: raw ?? "" };
  if (!raw) return out;

  const grab = (key: string): string | undefined => {
    const m = raw.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "m"));
    return m?.[1].trim();
  };

  out.profile = grab("Profile");
  out.budget = grab("Budget");
  out.timeline = grab("Timeline");
  out.revenueThreshold = grab("Revenue_threshold");
  out.founderSignal = grab("Signal");
  return out;
}

/** Compact one-line summary for badges, e.g. "Solo · $1K · 3-6 months · $50K/year". */
export function summarizeSessionConfig(parsed: ParsedSessionConfig): string {
  const parts: string[] = [];
  if (parsed.profile) parts.push(parsed.profile);
  if (parsed.budget) parts.push(parsed.budget);
  if (parsed.timeline) parts.push(parsed.timeline);
  if (parsed.revenueThreshold) parts.push(parsed.revenueThreshold);
  return parts.join(" · ");
}

export function hasSessionConfig(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const parsed = parseSessionConfig(raw);
  return Boolean(parsed.profile || parsed.budget || parsed.timeline || parsed.revenueThreshold || parsed.founderSignal);
}


// ---------------------------------------------------------------
// Structured-object form (preferred for the x402 agent API).
// Same wire format as the human UI's buildSessionConfig() emits, so the
// engine sees a single canonical SESSION_CONFIG.md regardless of which
// surface produced it.
// ---------------------------------------------------------------

export const SESSION_CONFIG_PROFILES = [
  "Solo",
  "Small Team (2-3)",
  "Small Team (4-5)",
  "Funded Team (6-15)",
  "Enterprise",
] as const;

export const SESSION_CONFIG_BUDGETS = [
  "$1K", "$5K", "$10K", "$25K", "$50K", "$100K+",
] as const;

export const SESSION_CONFIG_TIMELINES = [
  "2 weeks", "4 weeks", "4-8 weeks", "8-12 weeks", "3-6 months",
] as const;

export const SESSION_CONFIG_REVENUE_THRESHOLDS = [
  "$10K/year", "$50K/year", "$100K/year", "$500K/year", "$1M+/year",
] as const;

export interface SessionConfigInput {
  profile?: typeof SESSION_CONFIG_PROFILES[number];
  budget?: typeof SESSION_CONFIG_BUDGETS[number];
  timeline?: typeof SESSION_CONFIG_TIMELINES[number];
  revenue_threshold?: typeof SESSION_CONFIG_REVENUE_THRESHOLDS[number];
  founder_signal?: string;
}

/**
 * Serialize a structured SessionConfigInput into the SESSION_CONFIG.md
 * format the engine expects. Mirrors the human UI's buildSessionConfig()
 * output exactly so the engine sees identical strings whether the user is
 * a human filling the form or an agent posting JSON.
 *
 * Returns "" when no field is set, so callers can pass the result straight
 * through to the engine without a separate hasAny check.
 */
export function serializeSessionConfig(input: SessionConfigInput | undefined | null): string {
  if (!input) return "";
  const { profile, budget, timeline, revenue_threshold, founder_signal } = input;
  const hasProfileBlock = profile || budget || timeline || revenue_threshold;
  if (!hasProfileBlock && !(founder_signal && founder_signal.trim())) return "";
  const lines: string[] = ["# Session Config", ""];
  if (hasProfileBlock) {
    lines.push("## Project Profile");
    if (profile) lines.push(`Profile: ${profile}`);
    if (budget) lines.push(`Budget: ${budget}`);
    if (timeline) lines.push(`Timeline: ${timeline}`);
    if (revenue_threshold) lines.push(`Revenue_threshold: ${revenue_threshold}`);
  }
  if (founder_signal && founder_signal.trim()) {
    if (hasProfileBlock) lines.push("");
    lines.push("## Founder Signal");
    lines.push(`Signal: ${founder_signal.trim()}`);
  }
  return lines.join("\n");
}
