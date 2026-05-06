/**
 * /lab/debate-room — public WIP page that replays a real, completed Prove
 * debate as a Microsoft-Teams-style chat visualization.
 *
 * For the demo, this page hardcodes one showcase session UUID — the
 * AgentMeter REJECTED run that exercises the kill-brief Strategist path
 * we shipped on 2026-05-05. Once visuals are signed off we'll convert to
 * /lab/debate-room/[sessionId] and add a session picker.
 *
 * Server component: fetches via service role, passes typed payload to the
 * client. 404 on missing session (e.g. someone deleted the row in dev).
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { ProveSessionData } from "@/app/prove-report/prove-report-client";
import { DebateRoomClient } from "./debate-room-client";

export const metadata: Metadata = {
  title: "Debate Room (WIP) — GapSmith Lab",
  description: "Watch a real Prove session play back as a 6-persona panel chat. Mainnet replay, no payment required.",
};

// Showcase session: AgentMeter REJECTED. Picked because (1) exercises the
// post-2026-05-05 kill-brief Strategist path, (2) compact (1 round), (3)
// concrete reasoning (TAM fabrication, 4 funded competitors), so judges
// can read through end-to-end in ~2 minutes.
const SHOWCASE_SESSION_ID = "7e5b4b12-6a6c-4f7b-849e-11c8fec6c3c6";

export const revalidate = 300;  // 5 min ISR — content is immutable but page chrome may evolve

export default async function DebateRoomPage() {
  const sb = createServiceRoleClient();
  const { data, error } = await sb
    .from("prove_sessions")
    .select("id, idea, rounds, votes, verdict, report, status, total_cost_usd, model, created_at")
    .eq("id", SHOWCASE_SESSION_ID)
    .single();

  if (error || !data) {
    console.error("[lab/debate-room] showcase session not found:", error?.message);
    notFound();
  }

  return <DebateRoomClient session={data as ProveSessionData} />;
}
