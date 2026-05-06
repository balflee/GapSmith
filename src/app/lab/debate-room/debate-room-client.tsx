"use client";

/**
 * DebateRoomClient — AI chat room replay of a Prove session.
 *
 * Visual model is Claude.ai / ChatGPT, NOT Microsoft Teams. Reasons:
 * 1. Future plan is to let users inject prompts to steer the debate
 *    mid-flight, so the layout has to feel like a chat where you can
 *    type. The Teams "presence-strip + meeting" framing fights that.
 * 2. Higher information density — agents have a lot to say (5-10k chars
 *    per message), so a centered narrow column flows better than a
 *    grid layout.
 * 3. Reads as "AI agents talking" not "humans in a meeting", which is
 *    the actual product.
 *
 * Layout:
 *   - Sticky thin header: WIP badge + idea title + agent count pill
 *     (click to expand) + replay-speed picker
 *   - Centered narrow column (max-w-3xl), messages stream top to bottom
 *   - Each message: small 32px avatar + persona name + markdown content
 *   - Sub-agent tool calls (Trend Scout / Benchmark Hunter / Evidence
 *     Hunter) render as indented thread-reply bubbles below their parent
 *   - Phase markers as subtle inline dividers
 *   - Verdict reveal banner at the end (kept — it's the conclusion)
 *   - Disabled chat input at the bottom: "Coming soon — steer the debate"
 *     This is the visual hook for the future user-injection feature.
 *
 * Animations are CSS-only via IntersectionObserver. Speed picker controls
 * cadence: instant (no animation), normal (fade-in on scroll), slow
 * (auto-scroll one message per ~1.8s — useful for Loom captures).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AGENTS, MarkdownContent, VERDICT_CONFIG, type ProveSessionData } from "@/app/prove-report/prove-report-client";
import { buildTimeline, type SubAgentKind, type TimelineEvent } from "./timeline";

const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const SOFT_BG = "oklch(0.985 0.005 80)";
const PATINA = "#3db5a6";
const EMBER = "#d4743c";
const SOLANA_GRADIENT = `linear-gradient(135deg, ${PATINA}, ${EMBER})`;

// Personas with a baked-in avatar in public/lab/avatars/. Reviewer fact-check
// (phase A.5) and Reviewer assumption-attack (phase B) share the avatar —
// same agent, two distinct gates. Contrarian and Gap Finder don't have
// dedicated avatars yet (they're sub-personas of B); they fall back to the
// initial-circle treatment so they still render distinctively.
// `-v2.png` suffix is a one-time URL change to defeat aggressive caching
// (Next.js Image optimization, browser cache, dev-server in-memory cache)
// after we regenerated the avatars from photorealistic portraits to
// abstract web3-style geometric forms. Old URL was cached forever.
const AVATAR_FOR: Record<string, string> = {
  proposer: "/lab/avatars/proposer-v2.png",
  challenger: "/lab/avatars/challenger-v2.png",
  analyst: "/lab/avatars/analyst-v2.png",
  defender: "/lab/avatars/defender-v2.png",
  phase_a5_reviewer: "/lab/avatars/reviewer-v2.png",
  reviewer: "/lab/avatars/reviewer-v2.png",
  strategist: "/lab/avatars/strategist-v2.png",
};

// Sub-agent tool-call icons (no portrait — these are agent tools, not
// participants). Rendered as collapsed thread-reply chips below the
// parent message.
const SUB_AGENT_LABELS: Record<SubAgentKind, string> = {
  trend_scout: "Trend Scout",
  benchmark_hunter: "Benchmark Hunter",
  evidence_hunter: "Evidence Hunter",
};
const SUB_AGENT_ICONS: Record<SubAgentKind, string> = {
  trend_scout: "🔭",
  benchmark_hunter: "🎯",
  evidence_hunter: "🔍",
};

const ROSTER: { persona: keyof typeof AVATAR_FOR | "contrarian" | "gap_finder"; role: string }[] = [
  { persona: "proposer", role: "Pitches the idea" },
  { persona: "challenger", role: "Attacks viability" },
  { persona: "analyst", role: "Pressure-tests numbers" },
  { persona: "defender", role: "Steelmans" },
  { persona: "phase_a5_reviewer", role: "Fact-checks claims" },
  { persona: "strategist", role: "Synthesizes verdict" },
];

const VOTE_COLORS: Record<string, string> = {
  PROCEED: "oklch(0.55 0.16 155)",
  REJECT: "oklch(0.55 0.2 25)",
  CONDITIONAL: "oklch(0.60 0.14 85)",
};

type Speed = "instant" | "normal" | "slow";

export function DebateRoomClient({ session }: { session: ProveSessionData }) {
  const timeline = useMemo(() => buildTimeline(session), [session]);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [rosterOpen, setRosterOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputBottomRef = useRef<HTMLDivElement>(null);

  // Reveal animation via IntersectionObserver (instant mode = all revealed up-front).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    if (speed === "instant") {
      root.querySelectorAll<HTMLElement>("[data-msg]").forEach((el) => el.setAttribute("data-revealed", "true"));
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).setAttribute("data-revealed", "true");
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    root.querySelectorAll<HTMLElement>("[data-msg]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [speed]);

  // Slow auto-replay: walk through messages one at a time for ambient demo.
  useEffect(() => {
    if (speed !== "slow") return;
    const root = containerRef.current;
    if (!root) return;
    const messages = Array.from(root.querySelectorAll<HTMLElement>("[data-msg]"));
    let i = 0;
    const interval = setInterval(() => {
      const target = messages[i];
      if (!target) {
        clearInterval(interval);
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      i += 1;
    }, 1800);
    return () => clearInterval(interval);
  }, [speed]);

  const verdictEvent = timeline.find((e): e is Extract<TimelineEvent, { kind: "verdict" }> => e.kind === "verdict");
  const ideaTitle = session.idea.split(" — ")[0] || session.idea.slice(0, 80);
  const model = session.report?.model || session.model || "MiniMax-M2.7";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: SOFT_BG }}>
      {/* ========== STICKY HEADER ========== */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          background: "oklch(0.985 0.005 80 / 0.85)",
          borderColor: BORDER,
          WebkitBackdropFilter: "blur(8px)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 text-xs font-medium" style={{ color: MUTED }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: SOLANA_GRADIENT }} />
            GapSmith
          </Link>
          <span style={{ color: MUTED }}>/</span>
          <span className="inline-flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
              style={{ background: SOLANA_GRADIENT }}
            >
              Lab · WIP
            </span>
            <span className="text-sm font-semibold" style={{ color: FG }}>
              Debate Room
            </span>
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setRosterOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{ background: "white", color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
              aria-expanded={rosterOpen}
            >
              <RosterStack />
              <span>6 agents</span>
              <span style={{ color: MUTED }}>{rosterOpen ? "▴" : "▾"}</span>
            </button>
            <div className="flex rounded-md p-0.5" style={{ background: "oklch(0.94 0.012 75)" }}>
              {(["instant", "normal", "slow"] as Speed[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className="rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors"
                  style={{
                    background: speed === s ? "white" : "transparent",
                    color: speed === s ? FG : MUTED,
                    boxShadow: speed === s ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Idea + meta */}
        <div className="border-t" style={{ borderColor: BORDER, background: SOFT_BG }}>
          <div className="mx-auto max-w-3xl px-4 py-2 text-xs">
            <span style={{ color: MUTED }}>Replaying:</span>{" "}
            <span className="font-medium" style={{ color: FG }}>{ideaTitle}</span>
            <span className="mx-2" style={{ color: BORDER }}>·</span>
            <span style={{ color: MUTED }}>real mainnet session</span>
            <span className="mx-2" style={{ color: BORDER }}>·</span>
            <span style={{ color: MUTED }}>all agents on </span>
            <code className="font-mono text-[10px]" style={{ color: FG }}>{model}</code>
          </div>
        </div>

        {/* Roster expandable — agents grid */}
        {rosterOpen && (
          <div className="border-t" style={{ borderColor: BORDER, background: "white" }}>
            <div className="mx-auto max-w-3xl px-4 py-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ROSTER.map(({ persona, role }) => {
                  const def = AGENTS[persona] || { name: persona, color: FG, icon: "?" };
                  return (
                    <div key={persona} className="flex items-center gap-2 rounded-md p-1.5" style={{ background: SOFT_BG }}>
                      <Avatar persona={persona} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-semibold" style={{ color: def.color }}>
                          {def.name.replace(/ \(.*\)/, "")}
                        </div>
                        <div className="truncate text-[10px]" style={{ color: MUTED }}>{role}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ========== CHAT TIMELINE ========== */}
      <main ref={containerRef} className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {/* Conversation start marker */}
        <div data-msg className="reveal mb-6 flex items-center gap-3 text-[11px]" style={{ color: MUTED }}>
          <span className="h-px flex-1" style={{ background: BORDER }} />
          <span className="font-mono uppercase tracking-wider">Debate begins</span>
          <span className="h-px flex-1" style={{ background: BORDER }} />
        </div>

        {timeline.filter((e) => e.kind !== "verdict").map((event, i) => (
          <TimelineEventView key={i} event={event} />
        ))}

        {verdictEvent && <VerdictBanner event={verdictEvent} />}

        {/* Disabled chat input — visual hook for future "steer the debate" feature */}
        <div ref={inputBottomRef} className="mt-12">
          <div
            className="relative rounded-2xl px-4 py-3"
            style={{ background: "white", boxShadow: `0 4px 20px rgba(0,0,0,0.04), inset 0 0 0 1px ${BORDER}` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px]"
                style={{ background: SOFT_BG, color: MUTED, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
                aria-hidden
              >
                🔒
              </div>
              <input
                disabled
                placeholder="Inject a question or steer the debate…"
                className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: MUTED }}
              />
              <span
                className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: SOLANA_GRADIENT }}
              >
                Coming soon
              </span>
            </div>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
            Mixed-model debates and live human steering ship next. For now, this is a read-only replay of a real paid session.
          </p>
        </div>
      </main>
    </div>
  );
}

// ----------------------------------------------------------------
// Roster stack (small avatar overlap in header)
// ----------------------------------------------------------------

function RosterStack() {
  return (
    <span className="flex -space-x-1.5">
      {ROSTER.slice(0, 4).map(({ persona }) => (
        <span
          key={persona}
          className="inline-block h-4 w-4 overflow-hidden rounded-full"
          style={{ boxShadow: `0 0 0 1.5px white` }}
        >
          <Avatar persona={persona} size={16} />
        </span>
      ))}
    </span>
  );
}

// ----------------------------------------------------------------
// Avatar — uses baked PNG when available, falls back to colored initial.
// ----------------------------------------------------------------

function Avatar({ persona, size = 32 }: { persona: string; size?: number }) {
  const def = AGENTS[persona] || { name: persona, color: FG, icon: "?" };
  const avatar = AVATAR_FOR[persona];
  const px = `${size}px`;
  return (
    <span
      className="relative inline-block shrink-0 overflow-hidden rounded-full"
      style={{ width: px, height: px, boxShadow: `0 0 0 1.5px ${def.color}55` }}
    >
      {avatar ? (
        <Image src={avatar} alt={def.name} width={size * 2} height={size * 2} className="h-full w-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white"
          style={{ background: def.color }}
          aria-hidden
        >
          {def.icon}
        </span>
      )}
    </span>
  );
}

// ----------------------------------------------------------------
// Timeline event renderer
// ----------------------------------------------------------------

function TimelineEventView({ event }: { event: TimelineEvent }) {
  if (event.kind === "phase_marker") {
    return (
      <div data-msg className="reveal my-6 flex items-center gap-3 text-[10px]" style={{ color: MUTED }}>
        <span className="h-px flex-1" style={{ background: BORDER }} />
        <span className="rounded-full px-2.5 py-1 font-mono uppercase tracking-wider"
          style={{ background: "white", boxShadow: `inset 0 0 0 1px ${BORDER}`, color: FG }}>
          R{event.round} · Phase {event.phase} — {event.label}
        </span>
        <span className="h-px flex-1" style={{ background: BORDER }} />
      </div>
    );
  }

  if (event.kind === "agent_message") {
    return <AgentMessage event={event} />;
  }

  if (event.kind === "vote") {
    const voteUpper = event.vote.toUpperCase();
    const isNumericScore = /^[\d.]+$/.test(event.vote);
    const color = VOTE_COLORS[voteUpper] || MUTED;
    const def = AGENTS[event.voter] || { name: event.voter, color: FG, icon: "?" };
    return (
      <div data-msg className="reveal my-3 flex items-start gap-3">
        <Avatar persona={event.voter} size={28} />
        <div className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm" style={{ background: "white", boxShadow: `inset 0 0 0 1px ${BORDER}` }}>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-medium" style={{ color: def.color }}>{def.name.replace(/ \(.*\)/, "")}</span>
            <span style={{ color: MUTED }}>voted</span>
            {isNumericScore ? (
              <span className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: SOFT_BG, color: FG }}>
                score {event.vote}
              </span>
            ) : (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
                style={{ background: `${color}1a`, color }}
              >
                {voteUpper}
              </span>
            )}
          </div>
          {event.reason && (
            <div className="mt-1 text-[12px]" style={{ color: MUTED }}>{event.reason}</div>
          )}
          {event.conditions && event.conditions.length > 0 && (
            <ul className="mt-1.5 space-y-1 text-[11px]" style={{ color: MUTED }}>
              {event.conditions.slice(0, 3).map((c, i) => (
                <li key={i} className="flex gap-1.5">
                  <span style={{ color }} aria-hidden>•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ----------------------------------------------------------------
// AgentMessage — Claude.ai-style message row
// ----------------------------------------------------------------

function AgentMessage({ event }: { event: Extract<TimelineEvent, { kind: "agent_message" }> }) {
  const def = AGENTS[event.persona] || { name: event.persona, color: FG, icon: "?" };
  const [expanded, setExpanded] = useState(false);
  const [subOpen, setSubOpen] = useState(false);

  const previewLen = 480;
  const isLong = event.markdown.length > previewLen;
  const preview = isLong ? event.markdown.slice(0, previewLen) + "…" : event.markdown;

  return (
    <div data-msg className="reveal my-5 flex items-start gap-3">
      <Avatar persona={event.persona} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold" style={{ color: def.color }}>
            {def.name.replace(/ \(.*\)/, "")}
          </span>
          <span className="text-[10px] font-mono uppercase" style={{ color: MUTED, letterSpacing: "0.04em" }}>
            R{event.round} · {event.phase}
          </span>
        </div>

        <div className="mt-1">
          <MarkdownContent content={expanded ? event.markdown : preview} />
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[11px] font-medium hover:underline"
              style={{ color: PATINA }}
            >
              {expanded ? "Show less ↑" : "Show full reasoning ↓"}
            </button>
          )}
        </div>

        {event.subAgent && (
          <div className="mt-2 ml-1 border-l-2 pl-3" style={{ borderColor: BORDER }}>
            <button
              onClick={() => setSubOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors hover:bg-white"
              style={{ background: "transparent", color: FG }}
            >
              <span aria-hidden>{SUB_AGENT_ICONS[event.subAgent.kind]}</span>
              <span className="font-medium">{SUB_AGENT_LABELS[event.subAgent.kind]}</span>
              <span style={{ color: MUTED }}>· tool call</span>
              <span style={{ color: MUTED }}>{subOpen ? "▴" : "▾"}</span>
            </button>
            {subOpen && (
              <div className="mt-1 rounded-md p-2.5 text-[12px]"
                style={{ background: SOFT_BG, boxShadow: `inset 0 0 0 1px ${BORDER}`, color: FG }}>
                <MarkdownContent content={event.subAgent.markdown} />
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .reveal {
          opacity: 0;
          transform: translateY(6px);
          transition: opacity 350ms ease-out, transform 350ms ease-out;
        }
        .reveal[data-revealed="true"] {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}

// ----------------------------------------------------------------
// Verdict reveal — kept as a banner card at the end of the chat
// ----------------------------------------------------------------

function VerdictBanner({ event }: { event: Extract<TimelineEvent, { kind: "verdict" }> }) {
  const cfg = VERDICT_CONFIG[event.verdict] || VERDICT_CONFIG.CONDITIONAL_APPROVED;
  const [showFull, setShowFull] = useState(false);

  const fullContent =
    event.verdict === "PIVOT_OUT"
      ? event.pivotReport
      : event.output;
  const summaryContent = event.summary;

  const expandLabel =
    event.verdict === "PIVOT_OUT" ? "pivot report" :
    event.verdict === "REJECTED" ? "kill brief" :
    event.verdict === "APPROVED" || event.verdict === "CONDITIONAL_APPROVED" ? "execution plan" :
    "full reasoning";

  return (
    <div data-msg className="reveal my-10 overflow-hidden rounded-2xl"
      style={{ boxShadow: `0 8px 32px rgba(0,0,0,0.06)` }}>
      <div
        className="relative px-6 py-7 sm:px-8"
        style={{ background: `linear-gradient(135deg, ${cfg.bg}, oklch(0.985 0.005 80))` }}
      >
        {/* Banner illustration */}
        <div className="mb-5 overflow-hidden rounded-xl" style={{ boxShadow: `inset 0 0 0 1px ${BORDER}` }}>
          <Image
            src="/lab/avatars/verdict-banner-v2.png"
            alt="Scales — verdict illustration"
            width={1792}
            height={1024}
            className="h-28 w-full object-cover sm:h-36"
          />
        </div>

        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          Panel verdict
        </div>
        <div
          className="mt-1.5 font-heading text-3xl font-bold tracking-tight sm:text-4xl"
          style={{ color: cfg.text, letterSpacing: "-1.5px" }}
        >
          {cfg.label}
        </div>
        <p className="mt-2 max-w-2xl text-[13px]" style={{ color: FG, lineHeight: 1.55 }}>
          {cfg.description}
        </p>

        {summaryContent && summaryContent.trim() && (
          <div className="mt-5 rounded-xl p-4" style={{ background: "white", boxShadow: `inset 0 0 0 1px ${BORDER}` }}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
              Decision brief
            </div>
            <MarkdownContent content={summaryContent} />
          </div>
        )}

        {fullContent && fullContent.trim() && (
          <div className="mt-3">
            <button
              onClick={() => setShowFull((v) => !v)}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: "white", color: FG, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
            >
              {showFull ? "Hide full reasoning ↑" : `Read full ${expandLabel} ↓`}
            </button>
            {showFull && (
              <div
                className="mt-3 max-h-[600px] overflow-y-auto rounded-xl p-5"
                style={{ background: "white", boxShadow: `inset 0 0 0 1px ${BORDER}` }}
              >
                <MarkdownContent content={fullContent} />
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]" style={{ color: MUTED }}>
          {event.model && <span>Model · <span style={{ color: FG, fontFamily: "ui-monospace" }}>{event.model}</span></span>}
          {event.voteSummary && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{event.voteSummary.total_voters} voter{event.voteSummary.total_voters === 1 ? "" : "s"}</span>
            </>
          )}
          <span style={{ opacity: 0.4 }}>·</span>
          <Link href="/pricing" className="font-medium hover:underline" style={{ color: PATINA }}>
            Run your own debate →
          </Link>
        </div>
      </div>
    </div>
  );
}
