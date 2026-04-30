/**
 * GET /api/v1/jobs/{id}
 *
 * Polls an async x402 job's status. Free endpoint — the jobId itself acts
 * as a capability token (it's 128-bit-random and effectively unguessable).
 *
 * Response (200):
 * {
 *   "jobId": "fg_...",
 *   "endpoint": "/api/v1/forge/ideate",
 *   "status": "pending" | "running" | "completed" | "failed",
 *   "progressPct": 0..100,
 *   "result": {...} | null,           // populated when completed
 *   "error": string | null,            // populated when failed
 *   "txHash": "...",
 *   "createdAt": "...",
 *   "startedAt": "..." | null,
 *   "completedAt": "..." | null
 * }
 *
 * 404 if job id not found.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-server";

interface AgentJobRow {
  id: string;
  endpoint: string;
  status: string;
  progress_pct: number;
  result: unknown;
  error: string | null;
  tx_hash: string;
  amount_usdc_atomic: string;
  network: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const sb = createServiceRoleClient();
  const { data: rawData, error } = await sb
    .from("agent_jobs")
    .select("id, endpoint, status, progress_pct, result, error, tx_hash, amount_usdc_atomic, network, created_at, started_at, completed_at")
    .eq("id", id)
    .maybeSingle();
  const data = rawData as AgentJobRow | null;

  if (error) {
    console.error("/api/v1/jobs lookup failed:", error.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: data.id,
    endpoint: data.endpoint,
    status: data.status,
    progressPct: data.progress_pct,
    result: data.status === "completed" ? data.result : null,
    error: data.error,
    txHash: data.tx_hash,
    amountUsdcAtomic: data.amount_usdc_atomic,
    network: data.network,
    createdAt: data.created_at,
    startedAt: data.started_at,
    completedAt: data.completed_at,
  });
}
