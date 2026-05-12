"use client";

/**
 * LiveDebateRoomClient — subscribes to Supabase Realtime on a
 * lab_sessions row and re-renders the chat as the engine streams live
 * events. Falls back to 10s polling if Realtime fails. When status
 * flips to "complete" we hand off to DebateRoomClient for the full
 * timeline (votes, verdict banner, sub-agent threads).
 *
 * Two render modes:
 *   - RUNNING: stream chat from `live_events` (one bubble per agent
 *     reply, written by engine after each LLM call returns). This
 *     gives lab debates the "watch them argue" feel that Prove's
 *     batched-round flow doesn't.
 *   - COMPLETE: hand off to DebateRoomClient which renders the full
 *     timeline including votes, sub-agent threads, and the verdict
 *     banner.
 *
 * Falling back to "Convening the panel…" only when isRunning AND
 * live_events is empty (i.e. the engine hasn't started writing yet).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import { AGENTS, MarkdownContent, type ProveSessionData } from "@/app/prove-report/prove-report-client";
import { DebateRoomClient } from "./debate-room-client";

const PERSONA_LABELS: Record<string, string> = {
  proposer: "Proposer",
  challenger: "Challenger",
  analyst: "Analyst",
  reviewer: "Reviewer",
  defender: "Defender",
  strategist: "Strategist",
  // Sub-agents — surface their friendly name when they appear in events
  trend_scout: "Trend Scout",
  benchmark_hunter: "Benchmark Hunter",
  evidence_hunter: "Evidence Hunter",
  contrarian: "Contrarian",
  gap_finder: "Gap Finder",
};

// Avatars baked into /public/lab/avatars/ — same set DebateRoomClient
// uses for the replay. Sub-agents fall back to their parent's avatar.
const AVATAR_FOR: Record<string, string> = {
  proposer: "/lab/avatars/proposer-v2.webp",
  challenger: "/lab/avatars/challenger-v2.webp",
  analyst: "/lab/avatars/analyst-v2.webp",
  defender: "/lab/avatars/defender-v2.webp",
  reviewer: "/lab/avatars/reviewer-v2.webp",
  strategist: "/lab/avatars/strategist-v2.webp",
  trend_scout: "/lab/avatars/proposer-v2.webp",        // child of proposer
  benchmark_hunter: "/lab/avatars/analyst-v2.webp",     // child of analyst
  evidence_hunter: "/lab/avatars/defender-v2.webp",     // child of defender
  contrarian: "/lab/avatars/challenger-v2.webp",        // child of challenger
  gap_finder: "/lab/avatars/challenger-v2.webp",        // child of challenger
};

// Engine event shape — mirrors migration 018's append_live_event payload.
type LiveEvent = {
  persona: string;
  phase: string;
  round: number;
  markdown: string;
  is_sub_agent?: boolean;
  ts: string;
};

type LiveSession = ProveSessionData & {
  persona_models?: Record<string, string>;
  // ProveSessionData covers the report-time fields; lab/live needs the
  // running-time progress fields too. They're nullable for backward-compat
  // with sessions inserted before the progress columns existed.
  progress?: number;
  progress_message?: string;
  live_events?: LiveEvent[];
};

export function LiveDebateRoomClient({
  initialSession,
  sessionId,
}: {
  initialSession: LiveSession;
  sessionId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<LiveSession>(initialSession);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = session.status === "pending" || session.status === "running";
  const isComplete = session.status === "complete";
  const isError = session.status === "error";

  useEffect(() => {
    if (!isRunning) return;

    // Realtime subscription on this lab_sessions row.
    const channel = supabase
      .channel(`lab-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lab_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          setSession(prev => ({ ...prev, ...(payload.new as Partial<LiveSession>) }));
        },
      )
      .subscribe();

    // Fallback poll every 10s in case Realtime hiccups. Includes
    // live_events because that's what drives the streaming chat.
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("lab_sessions")
        .select("rounds, votes, verdict, report, status, progress, progress_message, total_cost_usd, live_events")
        .eq("id", sessionId)
        .single();
      if (data) {
        setSession(prev => ({ ...prev, ...(data as Partial<LiveSession>) }));
      }
    }, 10_000);

    return () => {
      channel.unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, isRunning, supabase]);

  return (
    <main>
      {/* Status banner — sticky at top so users see model lineup + phase
          without scrolling away from the chat */}
      <div
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          background: "oklch(0.985 0.005 80 / 90%)",
          borderColor: "oklch(0.90 0.012 75)",
        }}
      >
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: isComplete
                  ? "oklch(0.55 0.16 155 / 12%)"
                  : isError
                    ? "oklch(0.55 0.2 25 / 12%)"
                    : "oklch(0.65 0.18 320 / 12%)",
                color: isComplete
                  ? "oklch(0.40 0.16 155)"
                  : isError
                    ? "oklch(0.45 0.18 25)"
                    : "oklch(0.45 0.18 320)",
              }}
            >
              {isComplete ? "Complete" : isError ? "Error" : "Running"}
            </span>
            <div className="text-xs" style={{ color: "oklch(0.50 0.02 65)" }}>
              {session.progress_message || (isRunning ? "Initializing…" : isComplete ? `Verdict: ${session.verdict}` : "Stopped")}
            </div>
          </div>
          {session.persona_models && (
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap" style={{ color: "oklch(0.50 0.02 65)" }}>
              {Object.entries(session.persona_models).map(([persona, model]) => (
                <span
                  key={persona}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                  style={{
                    background: "oklch(0.94 0.008 75)",
                  }}
                  title={`${PERSONA_LABELS[persona] || persona}: ${model}`}
                >
                  <span style={{ color: "oklch(0.55 0.02 65)" }}>{(PERSONA_LABELS[persona] || persona).slice(0, 4)}</span>
                  <span className="font-mono">{shortenModel(model)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {isRunning && (session.progress ?? 0) > 0 && (
          <div className="h-0.5 w-full" style={{ background: "oklch(0.94 0.008 75)" }}>
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${Math.min(100, session.progress ?? 0)}%`,
                background: "linear-gradient(90deg, oklch(0.65 0.18 320), oklch(0.62 0.155 52))",
              }}
            />
          </div>
        )}
      </div>

      {/* Render priority:
            1. error → ErrorCard with diagnosed hint
            2. complete → full DebateRoomClient (timeline with votes,
               verdict banner, sub-agent threads)
            3. running with live events → streaming chat
            4. running with no events yet → "Convening…" placeholder

          DebateRoomClient must never receive an empty session — that
          renders an empty timeline that visually appears as fallthrough
          showcase content, which confuses users. So we gate on
          isComplete + non-empty rounds before handing off. */}
      {isError ? (
        <ErrorCard session={session} />
      ) : isComplete && session.rounds && session.rounds.length > 0 ? (
        <DebateRoomClient session={session} />
      ) : (session.live_events && session.live_events.length > 0) ? (
        <LiveStreamChat events={session.live_events} progressMessage={session.progress_message} />
      ) : (
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px" }}>
            Convening the panel…
          </div>
          <p className="text-sm" style={{ color: "oklch(0.50 0.02 65)", lineHeight: 1.6 }}>
            The engine is dispatching agents to their LLMs. The Proposer kicks off in
            ~1–3 minutes — first to speak depends on which model you picked. After that,
            each persona's reply lands in the chat below as soon as their LLM call
            returns.
          </p>
        </div>
      )}
    </main>
  );
}

/**
 * LiveStreamChat — renders the append-only live_events array as a
 * top-to-bottom chat. Auto-scrolls to bottom on each new message so
 * users don't have to manually follow along. Shows a "Next: X is
 * thinking…" pill at the bottom while a phase is in flight, sourced
 * from the engine's progress_message field.
 *
 * Sub-agent events render slightly indented + smaller so the eye
 * groups them under their parent persona's thread. The phase string
 * "SUB" is the engine signal for these.
 */
function LiveStreamChat({
  events,
  progressMessage,
}: {
  events: LiveEvent[];
  progressMessage?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message as new events arrive. We scroll
  // the sentinel into view rather than scrollTo(scrollHeight) so the
  // browser handles smooth easing.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6 flex items-center gap-3 text-[11px]" style={{ color: "oklch(0.50 0.02 65)" }}>
        <span className="h-px flex-1" style={{ background: "oklch(0.90 0.012 75)" }} />
        <span className="font-mono uppercase tracking-wider">Live debate</span>
        <span className="h-px flex-1" style={{ background: "oklch(0.90 0.012 75)" }} />
      </div>

      {events.map((ev, i) => (
        <LiveMessage key={`${ev.ts}-${i}`} event={ev} />
      ))}

      {/* "Typing" indicator. The engine writes progress_message before
          each phase starts (e.g. "Phase B challenger…"), so we can show
          who's about to speak. Only shows while messages are still
          arriving — once complete, the wrapper swaps us out for
          DebateRoomClient. */}
      {progressMessage && (
        <div className="mt-4 flex items-center gap-2 text-xs italic" style={{ color: "oklch(0.50 0.02 65)" }}>
          <TypingDots />
          <span>{progressMessage}</span>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function LiveMessage({ event }: { event: LiveEvent }) {
  const def = AGENTS[event.persona] || {
    name: PERSONA_LABELS[event.persona] || event.persona,
    color: "oklch(0.24 0.012 65)",
    icon: "?",
  };
  const avatar = AVATAR_FOR[event.persona];
  const isSub = event.is_sub_agent || event.phase === "SUB";
  const phaseLabel = isSub ? "sub-agent" : `R${event.round} · ${event.phase}`;
  const friendlyName = PERSONA_LABELS[event.persona] || def.name.replace(/ \(.*\)/, "");
  const avatarSize = isSub ? 24 : 32;

  return (
    <div
      className="my-5 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={{
        marginLeft: isSub ? 36 : 0,
        opacity: isSub ? 0.92 : 1,
      }}
    >
      <span
        className="relative inline-block shrink-0 overflow-hidden rounded-full"
        style={{
          width: avatarSize,
          height: avatarSize,
          boxShadow: `0 0 0 1.5px ${def.color}55`,
        }}
      >
        {avatar ? (
          <Image src={avatar} alt={friendlyName} width={avatarSize * 2} height={avatarSize * 2} className="h-full w-full object-cover" />
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
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={isSub ? "text-[12px] font-medium" : "text-[13px] font-semibold"} style={{ color: def.color }}>
            {friendlyName}
          </span>
          <span className="text-[10px] font-mono uppercase" style={{ color: "oklch(0.50 0.02 65)", letterSpacing: "0.04em" }}>
            {phaseLabel}
          </span>
        </div>
        <div className="mt-1">
          <MarkdownContent content={event.markdown} />
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="inline-block h-1 w-1 rounded-full animate-pulse" style={{ background: "oklch(0.65 0.18 320)", animationDelay: "0ms" }} />
      <span className="inline-block h-1 w-1 rounded-full animate-pulse" style={{ background: "oklch(0.65 0.18 320)", animationDelay: "150ms" }} />
      <span className="inline-block h-1 w-1 rounded-full animate-pulse" style={{ background: "oklch(0.65 0.18 320)", animationDelay: "300ms" }} />
    </span>
  );
}

/** Renders the failure state with a parsed, actionable hint when we can
 *  recognize the underlying litellm error class. Otherwise just shows the
 *  raw progress_message so users can copy it into a bug report. */
function ErrorCard({ session }: { session: LiveSession }) {
  const raw = session.progress_message || "The engine reported an error. Check Railway logs for details.";
  const hint = diagnoseError(raw, session.persona_models);
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="px-5 py-4 rounded-[8px]" style={{
        background: "oklch(0.55 0.2 25 / 8%)",
        color: "oklch(0.40 0.16 25)",
        border: "1px solid oklch(0.55 0.2 25 / 25%)",
      }}>
        <div className="font-semibold text-base mb-2">Run failed</div>
        {hint && (
          <div className="text-sm mb-3" style={{ lineHeight: 1.55 }}>
            {hint}
          </div>
        )}
        <details className="text-xs" style={{ color: "oklch(0.45 0.16 25)" }}>
          <summary className="cursor-pointer select-none">Show raw error</summary>
          <pre className="mt-2 px-3 py-2 rounded font-mono text-[11px] whitespace-pre-wrap break-all" style={{
            background: "oklch(0.99 0.005 85)",
            border: "1px solid oklch(0.55 0.2 25 / 18%)",
            maxHeight: "200px",
            overflow: "auto",
          }}>
            {raw}
          </pre>
        </details>
      </div>
    </div>
  );
}

/** Translate common litellm error strings into a one-line user fix.
 *  Returns null for unrecognized errors — caller falls back to raw text. */
function diagnoseError(msg: string, personaModels?: Record<string, string>): string | null {
  const lower = msg.toLowerCase();

  if (lower.includes("insufficient_quota") || lower.includes("you exceeded your current quota")) {
    const offending = findPersonasWithProvider(personaModels, ["gpt-", "openai"]);
    const who = offending.length ? ` (${offending.join(", ")})` : "";
    return `OpenAI quota exhausted${who}. Top up your account at platform.openai.com/account/billing, or pick a different provider for those personas (e.g. MiniMax-M2.7 or Claude Sonnet 4.6) and re-run.`;
  }

  if (lower.includes("invalid_api_key") || lower.includes("incorrect api key") || lower.includes("authentication") && lower.includes("key")) {
    return "One of your API keys was rejected by the provider. Open Settings → API Keys, re-paste the affected key, and re-run.";
  }

  if (lower.includes("ratelimiterror") || (lower.includes("rate limit") && !lower.includes("quota"))) {
    return "Hit a provider rate limit. Wait a minute and re-run, or pick a model on a less-saturated provider (MiniMax tends to have headroom).";
  }

  if (lower.includes("model_not_found") || lower.includes("does not exist or you do not have access")) {
    return "Your account doesn't have access to one of the selected models. Pick a model your tier supports (e.g. Claude Sonnet 4.6 instead of Opus, or GPT-5.4 instead of 5.5 Pro).";
  }

  if (lower.includes("context_length_exceeded") || lower.includes("maximum context length")) {
    return "Idea (plus debate history) overflowed a model's context window. Shorten the idea, or switch the affected persona to a longer-context model (Gemini 2.5 Pro, Claude Opus).";
  }

  if (lower.includes("tavily") || lower.includes("search api")) {
    return "External search (Tavily) failed. The debate can still run without it — but if you wanted search, check your TAVILY_API_KEY in Settings.";
  }

  return null;
}

/** Find personas whose model id matches any of the prefixes/keywords —
 *  used to point the user at exactly which dropdowns to change. */
function findPersonasWithProvider(personaModels: Record<string, string> | undefined, needles: string[]): string[] {
  if (!personaModels) return [];
  return Object.entries(personaModels)
    .filter(([, model]) => needles.some(n => model.toLowerCase().includes(n)))
    .map(([persona]) => PERSONA_LABELS[persona] || persona);
}

/** Trim model id for the model badge — long names like
 *  "gemini-3.1-pro-preview" eat horizontal space in the sticky header. */
function shortenModel(model: string): string {
  return model
    .replace(/^claude-/, "")
    .replace(/^gpt-/, "gpt-")
    .replace(/^gemini-/, "gem-")
    .replace(/-preview$/, "")
    .replace(/^MiniMax-/, "mm-");
}
