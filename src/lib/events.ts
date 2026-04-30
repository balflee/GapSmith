import { track } from "./analytics";

// --- Event funnel stage map (generated from experiment/EVENTS.yaml) ---

export const EVENT_FUNNEL_MAP: Record<string, string> = {
  visit_landing: "reach",
  cta_click: "demand",
  signup_start: "demand",
  signup_complete: "demand",
  api_key_saved: "activate",
  scout_start: "activate",
  scout_complete: "activate",
  forge_start: "activate",
  forge_complete: "activate",
  prove_start: "activate",
  prove_complete: "activate",
  email_welcome_sent: "activate",
  email_nudge_sent: "activate",
  pay_start: "monetize",
  pay_success: "monetize",
  x402_pay_start: "monetize",
  x402_pay_success: "monetize",
  retain_return: "retain",
} as const;

// --- Event wrappers (generated from experiment/EVENTS.yaml events map) ---

export function trackVisitLanding(props?: {
  variant?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}) {
  track("visit_landing", { ...props, funnel_stage: "reach" });
}

export function trackCtaClick(props?: {
  variant?: string;
  cta_text?: string;
}) {
  track("cta_click", { ...props, funnel_stage: "demand" });
}

export function trackSignupStart(props: { method: string }) {
  track("signup_start", { ...props, funnel_stage: "demand" });
}

export function trackSignupComplete(props: { method: string }) {
  track("signup_complete", { ...props, funnel_stage: "demand" });
}

export function trackApiKeySaved(props: { provider: string; model?: string }) {
  track("api_key_saved", { ...props, funnel_stage: "activate" });
}

export function trackScoutStart(props?: { sector_count?: number }) {
  track("scout_start", { ...props, funnel_stage: "activate" });
}

export function trackScoutComplete(props?: { gap_count?: number; report_id?: string }) {
  track("scout_complete", { ...props, funnel_stage: "activate" });
}

export function trackForgeStart(props?: { source?: string; scout_report_id?: string }) {
  track("forge_start", { ...props, funnel_stage: "activate" });
}

export function trackForgeComplete(props?: { idea_count?: number; session_id?: string }) {
  track("forge_complete", { ...props, funnel_stage: "activate" });
}

export function trackProveStart(props?: { source?: string; forge_session_id?: string }) {
  track("prove_start", { ...props, funnel_stage: "activate" });
}

export function trackProveComplete(props?: { verdict?: string; session_id?: string }) {
  track("prove_complete", { ...props, funnel_stage: "activate" });
}

export function trackRetainReturn(props?: { cycle_type?: string }) {
  track("retain_return", { ...props, funnel_stage: "retain" });
}

// --- Payment events (requires: [payment]) ---

export function trackPayStart(props: { plan: string; amount_cents: number }) {
  track("pay_start", { ...props, funnel_stage: "monetize" });
}

export function trackPaySuccess(props: { plan: string; amount_cents: number; provider: string }) {
  track("pay_success", { ...props, funnel_stage: "monetize" });
}

// --- x402 Solana payment events (requires: [payment_crypto]) ---

export function trackX402PayStart(props: { plan: string; amount_sol: number }) {
  track("x402_pay_start", { ...props, funnel_stage: "monetize" });
}

export function trackX402PaySuccess(props: {
  plan: string;
  amount_sol: number;
  tx_hash: string;
  provider: string;
}) {
  track("x402_pay_success", { ...props, funnel_stage: "monetize" });
}
