/**
 * /lab/debate-room/[sessionId] — live (or completed) view of a user's
 * mixed-LLM debate. Pulls from lab_sessions (the table that
 * /api/lab/debate-room/start creates rows in). For the static showcase
 * replay path see /lab/debate-room (no sessionId).
 *
 * Server component fetches the row's current state (which may be empty
 * if the engine just started) and hands off to LiveDebateRoomClient,
 * which subscribes to Realtime UPDATE events for streaming progress.
 */

import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import type { ProveSessionData } from "@/app/prove-report/prove-report-client";
import { LiveDebateRoomClient } from "../live-debate-room-client";

export const metadata: Metadata = {
  title: "Lab Debate Room — GapSmith",
};

export default async function LiveDebateRoomPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  // Auth: only the session owner can view their lab run. RLS enforces
  // this at the DB layer too, but a redirect to login is friendlier
  // than an empty 404.
  const sbAuth = await createServerSupabaseClient();
  const { data: { user } } = await sbAuth.auth.getUser();
  if (!user) {
    redirect(`/login?next=/lab/debate-room/${sessionId}`);
  }

  // Fetch via service role to bypass RLS on initial server-render —
  // the client subscription below uses the user-scoped client and RLS
  // will gate it correctly.
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("lab_sessions")
    .select("id, user_id, idea, persona_models, rounds, votes, verdict, report, status, progress, progress_message, total_cost_usd, model, created_at, live_events")
    .eq("id", sessionId)
    .single();

  if (error || !data) notFound();
  if (data.user_id !== user.id) notFound();  // belt + suspenders for RLS

  return <LiveDebateRoomClient initialSession={data as ProveSessionData & { persona_models?: Record<string, string> }} sessionId={sessionId} />;
}
