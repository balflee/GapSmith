"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabase";
import { trackProveComplete } from "@/lib/events";

// --- Real agent definitions ---
// Exported so /lab/debate-room can reuse the same persona color/name map
// without duplicating it. Keep this file as the canonical source.
export const AGENTS: Record<string, { name: string; icon: string; color: string }> = {
  proposer: { name: "Proposer", icon: "P", color: "oklch(0.62 0.155 52)" },
  phase_a5_reviewer: { name: "Reviewer (Fact-Check)", icon: "R", color: "oklch(0.55 0.16 155)" },
  challenger: { name: "Challenger", icon: "C", color: "oklch(0.55 0.2 25)" },
  analyst: { name: "Analyst", icon: "A", color: "oklch(0.55 0.16 155)" },
  reviewer: { name: "Reviewer (Assumption Attack)", icon: "R", color: "oklch(0.55 0.16 155)" },
  defender: { name: "Defender", icon: "D", color: "oklch(0.50 0.12 178)" },
  strategist: { name: "Strategist", icon: "S", color: "oklch(0.60 0.14 85)" },
  trend_scout: { name: "Trend Scout", icon: "🔭", color: "oklch(0.55 0.12 240)" },
  contrarian: { name: "Contrarian", icon: "🟣", color: "oklch(0.55 0.15 300)" },
  gap_finder: { name: "Gap Finder", icon: "🔵", color: "oklch(0.55 0.12 220)" },
  benchmark_hunter: { name: "Benchmark Hunter", icon: "🎯", color: "oklch(0.55 0.14 180)" },
  evidence_hunter: { name: "Evidence Hunter", icon: "🔍", color: "oklch(0.55 0.14 150)" },
};

// --- Types ---
// Exported for /lab/debate-room timeline transform and renderer.
export interface RoundData {
  round: number;
  proposer: string;
  challenger: string;
  challenger_score: number;
  analyst: string;
  defender: string;
  cost?: number;
  // CLI-parity fields (optional, from richer pipeline)
  phase_a5_reviewer?: string;
  reviewer?: string;
  trend_scout?: string;
  contrarian?: string;
  gap_finder?: string;
  benchmark_hunter?: string;
  evidence_hunter?: string;
  votes?: Record<string, { vote: string; reason?: string; conditions?: string[] }>;
}

export interface VoteSummary {
  vote_counts: Record<string, number>;
  conditions: string[];
  total_voters: number;
}

export interface ProveReport {
  output: string; // Strategist Phase 2 execution plan (markdown)
  summary?: string; // Strategist Phase 2 summary (Lean Canvas + 7-day sprint)
  analysis?: string; // Strategist Phase 1 analysis (markdown)
  verdict: string;
  vote_summary: VoteSummary;
  model: string;
  logic_blocked?: { count: number; issues: string } | null;
  pivot_report?: string | null;
}

export interface ProveSessionData {
  id: string;
  idea: string;
  rounds: RoundData[];
  votes: VoteSummary | { agent: string; vote: string; reason: string; conditions: string[] }[];
  verdict: string | null;
  report: ProveReport | null;
  status: string;
  total_cost_usd: number;
  model: string;
  created_at: string;
}

// --- Verdict config ---
// Exported for /lab/debate-room verdict reveal banner.
export const VERDICT_CONFIG: Record<string, { bg: string; text: string; glow: string; label: string; description: string }> = {
  APPROVED: {
    bg: "oklch(0.55 0.16 155 / 12%)", text: "oklch(0.55 0.16 155)", glow: "oklch(0.65 0.16 155)",
    label: "APPROVED", description: "Strong consensus to move forward. The idea has validated market potential and feasible execution path.",
  },
  CONDITIONAL_APPROVED: {
    bg: "oklch(0.60 0.14 85 / 12%)", text: "oklch(0.60 0.14 85)", glow: "oklch(0.78 0.14 85)",
    label: "CONDITIONAL", description: "The idea has potential but requires addressing key conditions before proceeding.",
  },
  REJECTED: {
    bg: "oklch(0.55 0.2 25 / 12%)", text: "oklch(0.55 0.2 25)", glow: "oklch(0.55 0.22 25)",
    label: "REJECTED", description: "The panel recommends against this idea in its current form. Consider pivoting or restructuring.",
  },
  PIVOT_OUT: {
    bg: "oklch(0.65 0.14 65 / 14%)", text: "oklch(0.50 0.16 60)", glow: "oklch(0.72 0.16 60)",
    label: "PIVOT OUT", description: "The panel did not reject the idea — they recommend pivoting to a related category. See the Pivot Report for the proposed direction and conditions.",
  },
};

// --- Markdown renderer ---
// Exported so /lab/debate-room renders agent messages with the exact same
// prose styling — keeps the two surfaces visually consistent.
export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose-sm" style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.6" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        h1: ({ children }) => <h2 className="text-lg font-bold mt-6 mb-2" style={{ fontFamily: "var(--font-heading)", color: "oklch(0.24 0.012 65)", letterSpacing: "-0.5px" }}>{children}</h2>,
        h2: ({ children }) => <h3 className="text-base font-bold mt-5 mb-2" style={{ fontFamily: "var(--font-heading)", color: "oklch(0.24 0.012 65)" }}>{children}</h3>,
        h3: ({ children }) => <h4 className="text-sm font-semibold mt-4 mb-1" style={{ color: "oklch(0.30 0.015 65)" }}>{children}</h4>,
        p: ({ children }) => <p className="text-sm mb-3" style={{ lineHeight: "1.65" }}>{children}</p>,
        ul: ({ children }) => <ul className="text-sm mb-3 pl-4 list-disc space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="text-sm mb-3 pl-4 list-decimal space-y-1">{children}</ol>,
        li: ({ children }) => <li className="text-sm" style={{ lineHeight: "1.55" }}>{children}</li>,
        strong: ({ children }) => <strong className="font-semibold" style={{ color: "oklch(0.24 0.012 65)" }}>{children}</strong>,
        table: ({ children }) => <div className="overflow-x-auto my-3"><table className="text-xs border-collapse w-full">{children}</table></div>,
        th: ({ children }) => <th className="text-left px-2 py-1.5 font-semibold border-b" style={{ borderColor: "oklch(0.90 0.010 75)", color: "oklch(0.30 0.015 65)" }}>{children}</th>,
        td: ({ children }) => <td className="px-2 py-1.5 border-b" style={{ borderColor: "oklch(0.94 0.008 75)" }}>{children}</td>,
        code: ({ children }) => <code className="text-xs px-1 py-0.5 rounded" style={{ background: "oklch(0.94 0.008 75)", color: "oklch(0.45 0.02 65)" }}>{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-l-2 pl-4 my-3 italic" style={{ borderColor: "oklch(0.60 0.14 85)", color: "oklch(0.45 0.02 65)" }}>{children}</blockquote>,
      }}>{content}</ReactMarkdown>
    </div>
  );
}

// --- Conditions list (replaces wall-of-text) ---
function ConditionsList({ conditions }: { conditions: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? conditions : conditions.slice(0, 3);
  const remaining = conditions.length - visible.length;
  return (
    <div className="mt-3 w-full max-w-[640px] text-left rounded-md p-4" style={{
      background: "oklch(0.97 0.005 80)",
      boxShadow: "inset 0 0 0 1px oklch(0.55 0.2 25 / 18%)",
    }}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-2" style={{ color: "oklch(0.55 0.2 25)" }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4v5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Conditions to Address ({conditions.length})
      </div>
      <ol className="space-y-1.5 pl-0 list-none">
        {visible.map((c, i) => (
          <li key={i} className="text-xs flex gap-2" style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.55" }}>
            <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold" style={{
              background: "oklch(0.55 0.2 25 / 12%)",
              color: "oklch(0.55 0.2 25)",
            }}>{i + 1}</span>
            <span>{c}</span>
          </li>
        ))}
      </ol>
      {remaining > 0 && (
        <button onClick={() => setExpanded(true)} className="mt-3 text-xs font-medium" style={{ color: "oklch(0.55 0.2 25)" }}>
          Show {remaining} more →
        </button>
      )}
      {expanded && conditions.length > 3 && (
        <button onClick={() => setExpanded(false)} className="mt-3 text-xs font-medium" style={{ color: "oklch(0.55 0.2 25)" }}>
          Show less
        </button>
      )}
    </div>
  );
}

// --- Agent output with collapse ---
function AgentOutput({ content, color }: { content: string; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.split("\n").length > 15;
  return (
    <div className="relative">
      <div className="pl-4 overflow-hidden" style={{ maxHeight: isLong && !expanded ? "200px" : "none" }}>
        <MarkdownContent content={content} />
      </div>
      {isLong && !expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-12 flex items-end justify-center" style={{ background: "linear-gradient(transparent, oklch(0.99 0.005 85))" }}>
          <button onClick={() => setExpanded(true)} className="text-xs font-medium px-3 py-1 mb-1 rounded-full" style={{ color, boxShadow: `0 0 0 1px ${color}33` }}>Show more</button>
        </div>
      )}
      {isLong && expanded && (
        <button onClick={() => setExpanded(false)} className="text-xs font-medium px-3 py-1 mt-1 rounded-full" style={{ color, boxShadow: `0 0 0 1px ${color}33` }}>Show less</button>
      )}
    </div>
  );
}

// --- Build full markdown (shared by MD + PDF export) ---
function buildProveMarkdown(session: ProveSessionData): string {
  let md = `# Prove Verification Report\n\n## ${session.idea}\n\n`;
  md += `**Verdict:** ${session.verdict}\n\n`;

  if (session.report?.output) {
    md += `## Strategist Report\n\n${session.report.output}\n\n`;
  }

  md += `## Debate Transcript\n\n`;
  for (const round of session.rounds) {
    md += `### Round ${round.round} (Challenger Score: ${round.challenger_score}/10)\n\n`;
    md += `**Proposer:**\n${round.proposer}\n\n`;
    md += `**Challenger:**\n${round.challenger}\n\n`;
    md += `**Analyst:**\n${round.analyst}\n\n`;
    md += `**Defender:**\n${round.defender}\n\n---\n\n`;
  }

  md += `\n---\n*Model: ${session.model || "---"} | Cost: $${session.total_cost_usd?.toFixed(2) || "0.00"} | Generated by GapSmith Prove*\n`;
  return md;
}

// --- Simple markdown → HTML for PDF export (no external deps) ---
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function proveSimpleMarkdownToHtml(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let inList = false;
  let inPara = false;
  const flushPara = () => { if (inPara) { out.push("</p>"); inPara = false; } };
  const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Table detection: header + separator + body rows
    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushPara(); flushList();
      const header = parseTableCells(line);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        bodyRows.push(parseTableCells(lines[i]));
        i++;
      }
      out.push("<table>");
      out.push("<thead><tr>" + header.map((h) => `<th>${h}</th>`).join("") + "</tr></thead>");
      out.push("<tbody>");
      for (const row of bodyRows) {
        out.push("<tr>" + row.map((c) => `<td>${c}</td>`).join("") + "</tr>");
      }
      out.push("</tbody></table>");
      continue;
    }

    if (/^### (.+)$/.test(line)) { flushPara(); flushList(); out.push(`<h3>${line.replace(/^### /, "")}</h3>`); i++; continue; }
    if (/^## (.+)$/.test(line)) { flushPara(); flushList(); out.push(`<h2>${line.replace(/^## /, "")}</h2>`); i++; continue; }
    if (/^# (.+)$/.test(line)) { flushPara(); flushList(); out.push(`<h1>${line.replace(/^# /, "")}</h1>`); i++; continue; }
    if (/^---+$/.test(line.trim())) { flushPara(); flushList(); out.push("<hr>"); i++; continue; }
    if (/^- (.+)$/.test(line) || /^\* (.+)$/.test(line)) {
      flushPara();
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${line.replace(/^[-*] /, "")}</li>`);
      i++; continue;
    }
    if (/^\d+\. (.+)$/.test(line)) {
      flushPara(); flushList();
      out.push(`<p>${line}</p>`);
      i++; continue;
    }
    if (line.trim() === "") {
      flushPara(); flushList();
      i++; continue;
    }
    flushList();
    if (!inPara) { out.push("<p>"); inPara = true; }
    out.push(line + "<br>");
    i++;
  }
  flushPara();
  flushList();

  return out.join("\n")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

// --- Print HTML via Blob URL (reliable style application) ---
function printHtmlReport(bodyHtml: string, title: string, accent: string = "#b48c3c") {
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; font-size: 14px; line-height: 1.7; }
  h1 { font-size: 26px; letter-spacing: -1px; margin: 0 0 8px; color: #111; }
  h2 { font-size: 19px; letter-spacing: -0.5px; border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; margin: 32px 0 12px; color: #111; }
  h3 { font-size: 15px; margin: 22px 0 8px; color: ${accent}; font-weight: 600; }
  p { margin: 0 0 10px; }
  blockquote { border-left: 3px solid ${accent}; padding-left: 12px; margin: 12px 0; color: #555; font-style: italic; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 28px 0; }
  strong { color: #111; font-weight: 600; }
  ul { padding-left: 20px; margin: 8px 0; }
  li { margin: 4px 0; }
  em { color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 12px 0; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: #fafafa; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  @page { margin: 14mm; }
  @media print {
    body { margin: 0 auto; max-width: 100%; }
    h2, h3 { page-break-after: avoid; }
    blockquote, table { page-break-inside: avoid; }
  }
</style>
</head><body>${bodyHtml}</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) { URL.revokeObjectURL(url); alert("Popup blocked. Please allow popups for this site to export PDF."); return; }
  const trigger = () => {
    try { win.focus(); win.print(); } catch { /* user closed */ }
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  if (win.document.readyState === "complete") {
    setTimeout(trigger, 300);
  } else {
    win.addEventListener("load", () => setTimeout(trigger, 300));
    setTimeout(trigger, 1500);
  }
}

// --- Export Markdown ---
function exportMarkdown(session: ProveSessionData) {
  const blob = new Blob([buildProveMarkdown(session)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prove-report-${session.id}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Export PDF (browser print) ---
function exportPdf(session: ProveSessionData) {
  const md = buildProveMarkdown(session);
  printHtmlReport(proveSimpleMarkdownToHtml(md), `Prove Report — ${new Date(session.created_at).toLocaleDateString()}`, "#b48c3c");
}

// --- Main ---
function ProveReportContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id");
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ProveSessionData | null>(null);

  useEffect(() => {
    async function loadSession() {
      if (!sessionId) { setLoading(false); return; }
      try {
        const { data } = await supabase
          .from("prove_sessions")
          .select("id, idea, rounds, votes, verdict, report, status, total_cost_usd, model, created_at")
          .eq("id", sessionId)
          .single();
        if (data) {
          setSession(data as unknown as ProveSessionData);
          trackProveComplete({ verdict: data.verdict, session_id: data.id });
        }
      } catch { /* fallback to no data */ }
      setLoading(false);
    }
    loadSession();
    // eslint-disable-next-line
  }, [sessionId]);

  if (loading) {
    return (
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-[8px] p-6 space-y-4" style={{ background: "oklch(0.96 0.008 85)" }}>
              <div className="h-5 w-2/3 rounded-[4px]" style={{ background: "linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.03 85), oklch(0.92 0.010 75))", backgroundSize: "200% 100%", animation: "ember-shimmer 1.8s ease-in-out infinite" }} />
              <div className="h-4 w-full rounded-[4px]" style={{ background: "linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.025 85), oklch(0.92 0.010 75))", backgroundSize: "200% 100%", animation: "ember-shimmer 1.8s ease-in-out infinite 0.1s" }} />
            </div>
          ))}
          <style>{`@keyframes ember-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
          <CardContent className="flex flex-col items-center py-16">
            <Image src="/images/empty-state.webp" alt="No report" width={240} height={240} className="mb-6 opacity-70" />
            <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1.5px", color: "oklch(0.24 0.012 65)" }}>
              No Report Found
            </h2>
            <div className="text-sm mb-6" style={{ color: "oklch(0.45 0.02 65)", maxWidth: "360px", textAlign: "center", lineHeight: "1.55" }}>
              Run a Prove debate first to generate a verification report.
            </div>
            <Link href="/prove" className={buttonVariants({ size: "lg" })} style={{ borderRadius: "9999px", background: "oklch(0.60 0.14 85)", color: "oklch(0.14 0.008 65)" }}>
              Start a Prove Debate
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // The engine now emits verdict="PIVOT_OUT" directly when pivot_report is
  // populated (debate_runner.py verdict_map). The pivot_report fallback is
  // kept for sessions persisted before that engine change shipped — they
  // store verdict="REJECTED" alongside a non-empty pivot_report.
  const hasPivotReport = !!session.report?.pivot_report?.trim();
  const verdictKey = session.verdict === "PIVOT_OUT" || hasPivotReport
    ? "PIVOT_OUT"
    : (session.verdict || "CONDITIONAL_APPROVED");
  const vc = VERDICT_CONFIG[verdictKey] || VERDICT_CONFIG.CONDITIONAL_APPROVED;
  const voteSummary = session.report?.vote_summary || (session.votes as VoteSummary);
  const voteCounts = voteSummary?.vote_counts || {};

  // Quick stats: total agents fired across all rounds + total citations
  const stats = (() => {
    const URL_RE = /https?:\/\/\S+/g;
    let agentCount = 0;
    let citations = 0;
    const agentKeys = ["proposer", "phase_a5_reviewer", "challenger", "analyst", "reviewer", "defender",
      "trend_scout", "contrarian", "gap_finder", "benchmark_hunter", "evidence_hunter"];
    for (const r of session.rounds || []) {
      for (const k of agentKeys) {
        const v = (r as unknown as Record<string, unknown>)[k];
        if (typeof v === "string" && v.trim().length > 0) {
          agentCount++;
          citations += (v.match(URL_RE) || []).length;
        }
      }
    }
    return { agentCount, citations, rounds: session.rounds?.length || 0 };
  })();

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12 overflow-x-hidden">
      {/* Header */}
      <BlurFade delay={0}>
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "oklch(0.84 0.145 85 / 15%)" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 1L13 7L19 8L14.5 12.5L15.5 19L10 16L4.5 19L5.5 12.5L1 8L7 7L10 1Z" fill="oklch(0.60 0.14 85)" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-2px", lineHeight: "1.08", color: "oklch(0.24 0.012 65)" }}>
                  Prove Report
                </h1>
                <div className="text-sm" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55", maxWidth: "560px" }}>
                  {session.idea}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="outline" onClick={() => exportMarkdown(session)} style={{ borderRadius: "9999px", boxShadow: "0 0 0 1px rgba(0,0,0,0.08)", border: "none" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mr-2"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Export Markdown
              </Button>
              <Button variant="outline" onClick={() => exportPdf(session)} style={{ borderRadius: "9999px", boxShadow: "0 0 0 1px rgba(0,0,0,0.08)", border: "none" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mr-2"><path d="M11 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-2-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                Export PDF
              </Button>
            </div>
          </div>
        </div>
      </BlurFade>

      {/* Verdict Card */}
      <BlurFade delay={0.08}>
        <Card className="relative overflow-hidden mb-6" style={{
          boxShadow: `0 0 0 1px ${vc.glow}30, 0 0 40px ${vc.glow}10`,
          borderRadius: "8px", border: "none",
        }}>
          <BorderBeam size={250} duration={8} colorFrom={vc.glow} colorTo="oklch(0.84 0.145 85)" />
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="inline-flex items-center gap-2 rounded-full px-6 py-2" style={{ background: vc.bg }}>
                <span className="text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1.5px", color: vc.text }}>
                  {vc.label}
                </span>
              </div>
              <div className="text-sm max-w-[500px]" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                {vc.description}
              </div>
              {/* Vote counts */}
              <div className="flex justify-center gap-6 mt-2">
                {Object.entries(voteCounts).map(([vote, count]) => (
                  <div key={vote} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{
                      background: vote === "PROCEED" ? "oklch(0.55 0.16 155)" : vote === "REJECT" ? "oklch(0.55 0.2 25)" : "oklch(0.60 0.14 85)",
                    }} />
                    <span className="text-sm" style={{ color: "oklch(0.45 0.02 65)" }}>
                      {vote}: <span className="font-medium" style={{ color: "oklch(0.24 0.012 65)" }}>{count as number}</span>
                    </span>
                  </div>
                ))}
              </div>
              {/* Conditions */}
              {voteSummary?.conditions?.length > 0 && (
                <ConditionsList conditions={voteSummary.conditions} />
              )}
            </div>
          </CardContent>
        </Card>
      </BlurFade>

      {/* Quick stats strip */}
      <BlurFade delay={0.10}>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs mb-6" style={{ color: "oklch(0.48 0.02 65)" }}>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tabular-nums" style={{ color: "oklch(0.24 0.012 65)" }}>{stats.rounds}</span>
            <span>{stats.rounds === 1 ? "round" : "rounds"}</span>
          </div>
          <span style={{ opacity: 0.3 }}>·</span>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tabular-nums" style={{ color: "oklch(0.24 0.012 65)" }}>{stats.agentCount}</span>
            <span>agent runs</span>
          </div>
          <span style={{ opacity: 0.3 }}>·</span>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tabular-nums" style={{ color: "oklch(0.24 0.012 65)" }}>{stats.citations}</span>
            <span>citations</span>
          </div>
          {session.model && (
            <>
              <span style={{ opacity: 0.3 }}>·</span>
              <div className="flex items-center gap-1.5">
                <span style={{ color: "oklch(0.24 0.012 65)" }}>{session.model}</span>
              </div>
            </>
          )}
          {session.total_cost_usd > 0 && (
            <>
              <span style={{ opacity: 0.3 }}>·</span>
              <div className="flex items-center gap-1.5">
                <span className="tabular-nums" style={{ color: "oklch(0.24 0.012 65)" }}>${session.total_cost_usd.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </BlurFade>

      {/* Pivot Report banner (rendered as amber PIVOT_OUT, not red REJECTED) */}
      {hasPivotReport && (
        <BlurFade delay={0.12}>
          <Card className="mb-6" style={{
            boxShadow: "0 0 0 1px oklch(0.72 0.16 60 / 30%), 0 0 24px oklch(0.72 0.16 60 / 8%)",
            borderRadius: "8px", border: "none",
          }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: "var(--font-heading)", color: "oklch(0.50 0.16 60)" }}>
                🔄 Pivot Report
              </CardTitle>
              <p className="text-xs mt-1" style={{ color: "oklch(0.45 0.02 65)" }}>
                The panel did not reject this idea. They recommend pivoting to a related category — see the proposed direction and conditions below.
              </p>
            </CardHeader>
            <CardContent>
              <MarkdownContent content={session.report!.pivot_report!} />
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {/* Logic Blocked banner (if triggered twice) */}
      {session.report?.logic_blocked?.count && session.report.logic_blocked.count >= 2 && (
        <BlurFade delay={0.13}>
          <Card className="mb-6" style={{
            boxShadow: "0 0 0 1px oklch(0.72 0.14 85 / 30%), 0 0 24px oklch(0.72 0.14 85 / 8%)",
            borderRadius: "8px", border: "none",
          }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2" style={{ color: "oklch(0.60 0.14 85)" }}>
                ⚠️ Unresolved Logic Issues (Detected {session.report.logic_blocked.count}×)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm whitespace-pre-wrap" style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.55" }}>
                {session.report.logic_blocked.issues.substring(0, 1500)}
              </div>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {/* Tabs: Strategist Report / Analysis / Debate Transcript */}
      <BlurFade delay={0.16}>
        <Tabs defaultValue="report" className="mb-6">
          <TabsList style={{ background: "oklch(0.93 0.012 75)", borderRadius: "8px" }}>
            <TabsTrigger value="report" style={{ borderRadius: "6px" }}>Execution Plan</TabsTrigger>
            {session.report?.summary && (
              <TabsTrigger value="summary" style={{ borderRadius: "6px" }}>Lean Canvas</TabsTrigger>
            )}
            {session.report?.analysis && (
              <TabsTrigger value="analysis" style={{ borderRadius: "6px" }}>Analysis</TabsTrigger>
            )}
            <TabsTrigger value="transcript" style={{ borderRadius: "6px" }}>Debate Transcript</TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="mt-6">
            {session.report?.output ? (
              <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                <CardContent className="p-6">
                  <MarkdownContent content={session.report.output} />
                </CardContent>
              </Card>
            ) : verdictKey === "PIVOT_OUT" ? (
              <Card style={{ boxShadow: "0 0 0 1px oklch(0.72 0.16 60 / 25%)", borderRadius: "8px", border: "none" }}>
                <CardContent className="py-10 px-6 text-center">
                  <div className="text-base font-medium mb-2" style={{ color: "oklch(0.50 0.16 60)" }}>No execution plan — panel recommended a pivot</div>
                  <div className="text-sm max-w-[520px] mx-auto" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                    The original framing changed category mid-debate, so the Strategist did not produce an execution plan for the original direction. See the <strong>Pivot Report</strong> above for the recommended new direction, and the <strong>Debate Transcript</strong> tab for how the panel got there.
                  </div>
                </CardContent>
              </Card>
            ) : verdictKey === "REJECTED" ? (
              <Card style={{ boxShadow: "0 0 0 1px oklch(0.55 0.2 25 / 20%)", borderRadius: "8px", border: "none" }}>
                <CardContent className="py-10 px-6 text-center">
                  <div className="text-base font-medium mb-2" style={{ color: "oklch(0.55 0.2 25)" }}>No execution plan generated</div>
                  <div className="text-sm max-w-[480px] mx-auto" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                    This idea was rejected during the debate (typically via Challenger&apos;s market-viability veto when score ≤ 4). The Strategist only produces an execution plan for ideas that survive scrutiny. See the <strong>Debate Transcript</strong> tab for the agents&apos; full reasoning.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                <CardContent className="py-10 text-center">
                  <div className="text-sm" style={{ color: "oklch(0.48 0.02 65)" }}>No strategist report available for this session.</div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {session.report?.summary && (
            <TabsContent value="summary" className="mt-6">
              <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                <CardContent className="p-6">
                  <MarkdownContent content={session.report.summary} />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {session.report?.analysis && (
            <TabsContent value="analysis" className="mt-6">
              <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                <CardContent className="p-6">
                  <MarkdownContent content={session.report.analysis} />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="transcript" className="mt-6">
            <div className="space-y-6">
              {session.rounds.map((round) => (
                <Card key={round.round} style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-3" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold" style={{ background: "oklch(0.84 0.145 85 / 15%)", color: "oklch(0.60 0.14 85)" }}>
                        {round.round}
                      </span>
                      Round {round.round}
                      <Badge variant="secondary" style={{
                        background: round.challenger_score >= 7 ? "oklch(0.55 0.16 155 / 12%)" : round.challenger_score >= 4 ? "oklch(0.72 0.14 85 / 12%)" : "oklch(0.55 0.2 25 / 12%)",
                        color: round.challenger_score >= 7 ? "oklch(0.55 0.16 155)" : round.challenger_score >= 4 ? "oklch(0.60 0.14 85)" : "oklch(0.55 0.2 25)",
                        borderRadius: "4px",
                      }}>Score: {round.challenger_score}/10</Badge>
                      {round.votes && Object.keys(round.votes).length > 0 && (
                        <div className="flex items-center gap-1 ml-1">
                          {Object.entries(round.votes).map(([voter, v]) => {
                            const voteColor =
                              v.vote === "PROCEED" ? "oklch(0.55 0.16 155)" :
                              v.vote === "REJECT" ? "oklch(0.55 0.2 25)" :
                              "oklch(0.60 0.14 85)";
                            return (
                              <span key={voter} title={`${voter}: ${v.vote}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide" style={{
                                background: `${voteColor.replace(")", " / 10%)")}`,
                                color: voteColor,
                              }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: voteColor }} />
                                {voter}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      // Full CLI-parity agent ordering (only render those present)
                      const agentOrder: Array<{ key: string; content?: string }> = [
                        { key: "trend_scout", content: round.trend_scout },
                        { key: "proposer", content: round.proposer },
                        { key: "phase_a5_reviewer", content: round.phase_a5_reviewer },
                        { key: "challenger", content: round.challenger },
                        { key: "analyst", content: round.analyst },
                        { key: "benchmark_hunter", content: round.benchmark_hunter },
                        { key: "contrarian", content: round.contrarian },
                        { key: "gap_finder", content: round.gap_finder },
                        { key: "reviewer", content: round.reviewer },
                        { key: "evidence_hunter", content: round.evidence_hunter },
                        { key: "defender", content: round.defender },
                      ];
                      const present = agentOrder.filter(a => a.content && a.content.trim().length > 0);
                      return present.map((agent, i) => {
                        const a = AGENTS[agent.key] || { name: agent.key, icon: "?", color: "oklch(0.48 0.02 65)" };
                        const isLast = i === present.length - 1;
                        return (
                          <div key={agent.key}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                              <span className="text-sm font-medium" style={{ color: a.color }}>{a.name}</span>
                            </div>
                            <AgentOutput content={agent.content!} color={a.color} />
                            {!isLast && <div className="w-full h-px mt-4" style={{ background: "oklch(0.24 0.012 65 / 8%)" }} />}
                          </div>
                        );
                      });
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </BlurFade>

      {/* Cost Footer */}
      {(session.total_cost_usd > 0 || session.model) && (
        <BlurFade delay={0.22}>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs mt-2 mb-2" style={{ color: "oklch(0.48 0.02 65)" }}>
            {session.model && <span>Model: {session.model}</span>}
            {session.model && session.total_cost_usd > 0 && <span style={{ opacity: 0.3 }}>|</span>}
            {session.total_cost_usd > 0 && <span>${session.total_cost_usd.toFixed(2)} API cost</span>}
          </div>
        </BlurFade>
      )}

      {/* Bottom CTA */}
      <BlurFade delay={0.24}>
        <Card className="text-center mt-6" style={{
          background: "linear-gradient(135deg, oklch(0.96 0.008 85), oklch(0.94 0.015 85))",
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06), 0 0 40px rgba(180, 140, 60, 0.10)",
          borderRadius: "8px", border: "none",
        }}>
          <CardContent className="py-8">
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px", color: "oklch(0.24 0.012 65)" }}>
              Run Another Debate
            </h3>
            <div className="text-sm mb-6" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55", maxWidth: "420px", margin: "0 auto 1.5rem" }}>
              Test another idea or refine this one with a different angle.
            </div>
            <Link href="/prove" className={buttonVariants({ size: "lg" })} style={{
              borderRadius: "9999px", background: "oklch(0.60 0.14 85)", color: "oklch(0.14 0.008 65)",
              boxShadow: "0 4px 16px rgba(180, 140, 60, 0.25), 0 0 30px rgba(180, 140, 60, 0.10)",
              fontWeight: 600,
            }}>
              Start New Prove Debate
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ml-2"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          </CardContent>
        </Card>
      </BlurFade>
    </div>
  );
}

export default function ProveReportClientWrapper() {
  return (
    <Suspense fallback={
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="space-y-6">
          <div className="h-10 w-64 rounded-[4px]" style={{ background: "oklch(0.92 0.010 75)" }} />
          <div className="h-48 rounded-[8px]" style={{ background: "oklch(0.96 0.008 85)" }} />
        </div>
      </div>
    }>
      <ProveReportContent />
    </Suspense>
  );
}
