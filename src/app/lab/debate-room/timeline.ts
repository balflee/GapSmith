/**
 * Pure transform: ProveSessionData → flat TimelineEvent[] for chat-style replay.
 *
 * The engine persists each round as one big object with 11 persona fields, all
 * markdown blobs, no per-message timestamps. To replay this as a chronological
 * Slack/Teams chat we expand each round into its phase-ordered sequence:
 *   A:    Proposer (sub: trend_scout)
 *   A.5:  Reviewer fact-check
 *   B:    Challenger, Analyst (sub: benchmark_hunter), Reviewer (assumption attack),
 *         Contrarian, Gap Finder
 *   C:    Defender (sub: evidence_hunter)
 *   D:    Vote tally — one event per voter recorded in `votes`
 * Then the verdict event from `report` (Strategist final synthesis).
 *
 * Empty/missing persona blobs are skipped (e.g. R1 may not fire `gap_finder`).
 *
 * Strategist is intentionally NOT rendered as an in-round message — it lives
 * in `report.output / summary / pivot_report` and surfaces as the verdict
 * reveal at the bottom of the timeline.
 *
 * Pivot path: when `report.pivot_report` is non-empty, the engine emits
 * verdict="PIVOT_OUT" (post-fix) but pre-fix sessions stored verdict="REJECTED"
 * alongside the pivot_report. Treat either as PIVOT_OUT here for backward
 * compatibility with old persisted sessions.
 */

import type { ProveReport, ProveSessionData, RoundData, VoteSummary } from "@/app/prove-report/prove-report-client";

export type PersonaKey =
  | "proposer"
  | "phase_a5_reviewer"
  | "challenger"
  | "analyst"
  | "reviewer"
  | "defender"
  | "contrarian"
  | "gap_finder";

export type SubAgentKind = "trend_scout" | "benchmark_hunter" | "evidence_hunter";

export type Phase = "A" | "A.5" | "B" | "C" | "D";

export type Verdict = "APPROVED" | "CONDITIONAL_APPROVED" | "REJECTED" | "PIVOT_OUT";

export type TimelineEvent =
  | {
      kind: "phase_marker";
      round: number;
      phase: Phase;
      label: string;
    }
  | {
      kind: "agent_message";
      round: number;
      phase: Phase;
      persona: PersonaKey;
      markdown: string;
      subAgent?: { kind: SubAgentKind; markdown: string };
    }
  | {
      kind: "vote";
      round: number;
      voter: string;       // PersonaKey or "challenger" (score), kept open for "strategist" arbitration
      vote: string;        // PROCEED | REJECT | CONDITIONAL | numeric score (challenger)
      reason: string;
      conditions?: string[];
    }
  | {
      kind: "verdict";
      verdict: Verdict;
      pivotReport?: string;
      output?: string;
      summary?: string;
      voteSummary?: VoteSummary;
      idea: string;
      model?: string;
    };

const PHASE_LABELS: Record<Phase, string> = {
  "A": "Proposer presents",
  "A.5": "Reviewer fact-check",
  "B": "Adversarial review",
  "C": "Defender responds",
  "D": "Vote",
};

/** True if a markdown blob has real content (not just whitespace/null). */
function hasContent(s: string | null | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

/** Push a phase_marker only if at least one of the referenced messages will fire. */
function pushPhaseMarkerIf(
  out: TimelineEvent[],
  round: number,
  phase: Phase,
  willHaveAtLeastOneMessage: boolean,
) {
  if (willHaveAtLeastOneMessage) {
    out.push({ kind: "phase_marker", round, phase, label: PHASE_LABELS[phase] });
  }
}

function processRound(out: TimelineEvent[], r: RoundData) {
  const round = r.round;

  // ---- Phase A — Proposer ----
  if (hasContent(r.proposer)) {
    pushPhaseMarkerIf(out, round, "A", true);
    const subAgent = hasContent(r.trend_scout)
      ? { kind: "trend_scout" as SubAgentKind, markdown: r.trend_scout! }
      : undefined;
    out.push({
      kind: "agent_message",
      round,
      phase: "A",
      persona: "proposer",
      markdown: r.proposer,
      subAgent,
    });
  }

  // ---- Phase A.5 — Reviewer fact-check ----
  if (hasContent(r.phase_a5_reviewer)) {
    pushPhaseMarkerIf(out, round, "A.5", true);
    out.push({
      kind: "agent_message",
      round,
      phase: "A.5",
      persona: "phase_a5_reviewer",
      markdown: r.phase_a5_reviewer!,
    });
  }

  // ---- Phase B — Adversarial review (5 personas, ordering matches the engine) ----
  // Engine fires Challenger → Analyst (with Benchmark Hunter sub-agent) → Reviewer
  // (assumption attack) → Contrarian → Gap Finder. The order matters for replay
  // because each subsequent persona reacts to earlier ones in the conversation.
  const phaseBHas =
    hasContent(r.challenger) ||
    hasContent(r.analyst) ||
    hasContent(r.reviewer) ||
    hasContent(r.contrarian) ||
    hasContent(r.gap_finder);
  pushPhaseMarkerIf(out, round, "B", phaseBHas);

  if (hasContent(r.challenger)) {
    out.push({ kind: "agent_message", round, phase: "B", persona: "challenger", markdown: r.challenger });
  }
  if (hasContent(r.analyst)) {
    const subAgent = hasContent(r.benchmark_hunter)
      ? { kind: "benchmark_hunter" as SubAgentKind, markdown: r.benchmark_hunter! }
      : undefined;
    out.push({ kind: "agent_message", round, phase: "B", persona: "analyst", markdown: r.analyst, subAgent });
  }
  if (hasContent(r.reviewer)) {
    out.push({ kind: "agent_message", round, phase: "B", persona: "reviewer", markdown: r.reviewer! });
  }
  if (hasContent(r.contrarian)) {
    out.push({ kind: "agent_message", round, phase: "B", persona: "contrarian", markdown: r.contrarian! });
  }
  if (hasContent(r.gap_finder)) {
    out.push({ kind: "agent_message", round, phase: "B", persona: "gap_finder", markdown: r.gap_finder! });
  }

  // ---- Phase C — Defender (sub: Evidence Hunter) ----
  if (hasContent(r.defender)) {
    pushPhaseMarkerIf(out, round, "C", true);
    const subAgent = hasContent(r.evidence_hunter)
      ? { kind: "evidence_hunter" as SubAgentKind, markdown: r.evidence_hunter! }
      : undefined;
    out.push({
      kind: "agent_message",
      round,
      phase: "C",
      persona: "defender",
      markdown: r.defender,
      subAgent,
    });
  }

  // ---- Phase D — Vote ----
  // `votes` shape: Record<voter, { vote, reason?, conditions? }> where vote is
  // PROCEED / REJECT / CONDITIONAL (binary voters) or a numeric score string
  // (challenger). We emit one event per recorded voter so the chat shows
  // each vote landing in turn.
  if (r.votes && Object.keys(r.votes).length > 0) {
    pushPhaseMarkerIf(out, round, "D", true);
    for (const [voter, v] of Object.entries(r.votes)) {
      out.push({
        kind: "vote",
        round,
        voter,
        vote: String(v?.vote ?? ""),
        reason: v?.reason ?? "",
        conditions: v?.conditions,
      });
    }
  }
}

function deriveVerdict(report: ProveReport | null, sessionVerdict: string | null): Verdict {
  // Engine post-fix: report.verdict is the canonical value (includes PIVOT_OUT).
  // Pre-fix legacy: pivot_report set + verdict="REJECTED" — treat as PIVOT_OUT.
  if (report?.pivot_report && report.pivot_report.trim()) return "PIVOT_OUT";
  const v = report?.verdict ?? sessionVerdict ?? "CONDITIONAL_APPROVED";
  if (v === "APPROVED" || v === "CONDITIONAL_APPROVED" || v === "REJECTED" || v === "PIVOT_OUT") return v;
  return "CONDITIONAL_APPROVED";
}

export function buildTimeline(session: ProveSessionData): TimelineEvent[] {
  const out: TimelineEvent[] = [];

  for (const round of session.rounds ?? []) {
    processRound(out, round);
  }

  const verdict = deriveVerdict(session.report, session.verdict);
  out.push({
    kind: "verdict",
    verdict,
    pivotReport: session.report?.pivot_report ?? undefined,
    output: session.report?.output,
    summary: session.report?.summary,
    voteSummary: session.report?.vote_summary,
    idea: session.idea,
    model: session.report?.model ?? session.model,
  });

  return out;
}
