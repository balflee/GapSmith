"use client";

/**
 * LiveDebateRoomClient — subscribes to Supabase Realtime on a
 * lab_sessions row and re-renders DebateRoomClient as the engine writes
 * new rounds / progress / final report. Falls back to 10s polling if
 * Realtime fails. When status flips to "complete" the run is done and
 * we stop subscribing.
 *
 * Wraps DebateRoomClient (the showcase visualization) so the live and
 * replay paths share the same chat UI. Differences:
 *   - This client adds a status banner at top showing model lineup +
 *     current phase, since lab users want to see "OK my Claude Defender
 *     is responding now" without scrolling.
 *   - Auto-reveal: while running, all messages render instantly (no
 *     fade-in animation) — feels more like watching live output than
 *     a curated replay.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { ProveSessionData } from "@/app/prove-report/prove-report-client";
import { DebateRoomClient } from "./debate-room-client";

const PERSONA_LABELS: Record<string, string> = {
  proposer: "Proposer",
  challenger: "Challenger",
  analyst: "Analyst",
  reviewer: "Reviewer",
  defender: "Defender",
  strategist: "Strategist",
};

type LiveSession = ProveSessionData & {
  persona_models?: Record<string, string>;
  // ProveSessionData covers the report-time fields; lab/live needs the
  // running-time progress fields too. They're nullable for backward-compat
  // with sessions inserted before the progress columns existed.
  progress?: number;
  progress_message?: string;
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

    // Fallback poll every 10s in case Realtime hiccups.
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("lab_sessions")
        .select("rounds, votes, verdict, report, status, progress, progress_message, total_cost_usd")
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

      {/* Empty-rounds placeholder while engine is warming up */}
      {(!session.rounds || session.rounds.length === 0) && isRunning ? (
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px" }}>
            Convening the panel…
          </div>
          <p className="text-sm" style={{ color: "oklch(0.50 0.02 65)", lineHeight: 1.6 }}>
            The engine is dispatching agents to their LLMs. First round usually lands in
            2–10 minutes depending on the slowest model — Gemini and Claude with native
            web search take longer than MiniMax. The chat below will populate as rounds
            complete.
          </p>
        </div>
      ) : (
        <DebateRoomClient session={session} />
      )}

      {isError && (
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="text-sm px-4 py-3 rounded-[6px]" style={{
            background: "oklch(0.55 0.2 25 / 8%)",
            color: "oklch(0.45 0.18 25)",
            border: "1px solid oklch(0.55 0.2 25 / 25%)",
          }}>
            <div className="font-semibold mb-1">Run failed</div>
            <div>{session.progress_message || "The engine reported an error. Check Railway logs for details."}</div>
          </div>
        </div>
      )}
    </main>
  );
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
