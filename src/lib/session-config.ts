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
