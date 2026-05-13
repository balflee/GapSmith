"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// Tabs removed — content is now flat sections
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trackScoutComplete } from "@/lib/events";
import { createClient } from "@/lib/supabase";
import type { ScoutReport } from "@/lib/types";

/** Simple markdown → HTML for PDF export (no external deps) */
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

function simpleMarkdownToHtml(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let inList = false;
  let inPara = false;
  const flushPara = () => { if (inPara) { out.push("</p>"); inPara = false; } };
  const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // GFM table: header + separator + body rows
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
    if (/^&gt; (.+)$/.test(line)) { flushPara(); flushList(); out.push(`<blockquote>${line.replace(/^&gt; /, "")}</blockquote>`); i++; continue; }
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

/** Print HTML via Blob URL (reliable style application — avoids document.write race) */
function printHtmlReport(bodyHtml: string, title: string, accent: string = "#2dd4bf") {
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

// --- Mock data for demo / loading fallback ---
const MOCK_REPORT: ScoutReport = {
  id: "demo-report-1",
  user_id: "demo-user-id",
  sectors: ["saas", "ai-ml", "devtools"],
  gaps: [
    {
      title: "AI Code Review for Legacy Codebases",
      description: "Enterprise teams with 10+ year old codebases lack AI tools that understand legacy patterns, custom frameworks, and undocumented conventions. Existing AI code review tools are trained on modern open-source patterns.",
      severity: "high",
      signal_count: 14,
      sources: ["r/ExperiencedDevs", "HN", "Dev.to"],
    },
    {
      title: "Multi-LLM Orchestration for CI/CD",
      description: "DevOps teams want to route different pipeline stages to different LLM providers based on cost, latency, and accuracy, but no tool provides unified orchestration across providers.",
      severity: "high",
      signal_count: 9,
      sources: ["r/devops", "The New Stack", "InfoQ"],
    },
    {
      title: "AI-Native API Documentation",
      description: "API consumers increasingly use AI assistants to understand APIs. Current documentation formats (OpenAPI, README) are optimized for human reading, not AI parsing. Need llms.txt-native doc generation.",
      severity: "medium",
      signal_count: 7,
      sources: ["HN", "r/webdev", "Changelog"],
    },
    {
      title: "Compliance-Aware LLM Gateway",
      description: "Regulated industries (healthcare, finance) need an LLM gateway that enforces data residency, PII redaction, and audit logging before requests reach the provider.",
      severity: "medium",
      signal_count: 11,
      sources: ["r/healthIT", "FinTech Weekly", "HN"],
    },
  ],
  pain_clusters: [
    {
      theme: "Cost Predictability",
      description: "Teams cannot predict LLM API costs, leading to surprise bills. Need per-team budgets, cost alerts, and model routing based on cost caps.",
      mentions: 23,
      intensity: "high",
    },
    {
      theme: "Vendor Lock-in Anxiety",
      description: "Engineering teams hesitate to deeply integrate any single LLM provider, fearing API changes, pricing shifts, or deprecation. They want abstraction layers.",
      mentions: 18,
      intensity: "high",
    },
    {
      theme: "Evaluation Fatigue",
      description: "New models release weekly. Teams lack automated benchmarking pipelines to evaluate models against their specific use cases.",
      mentions: 12,
      intensity: "medium",
    },
  ],
  trends: [
    {
      title: "BYOK (Bring Your Own Key) as Default",
      description: "More SaaS products adopt BYOK model to reduce costs and let users choose their preferred LLM provider. Shift from platform-managed to user-managed AI infrastructure.",
      momentum: "accelerating",
      timeframe: "6-12 months",
    },
    {
      title: "Agent-to-Agent Protocols",
      description: "Emerging standards for AI agents to communicate with each other (A2A, MCP). Early infrastructure plays are forming around agent orchestration and discovery.",
      momentum: "emerging",
      timeframe: "12-18 months",
    },
    {
      title: "AI-Native Testing",
      description: "Shift from traditional unit/integration tests to AI-generated test suites that evolve with the codebase. Property-based testing with LLM-generated invariants.",
      momentum: "steady",
      timeframe: "6-12 months",
    },
  ],
  daily_brief: "",
  topics: "",
  keywords: [],
  status: "complete",
  total_cost_usd: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  model: "demo",
  created_at: new Date(Date.now() - 3600000).toISOString(),
};

const SECTOR_LABELS: Record<string, string> = {
  saas: "SaaS & Cloud",
  fintech: "Fintech",
  healthtech: "Health Tech",
  edtech: "EdTech",
  ecommerce: "E-Commerce",
  "ai-ml": "AI & ML",
  climate: "Climate Tech",
  proptech: "PropTech",
  logistics: "Logistics",
  creator: "Creator Economy",
  cybersecurity: "Cybersecurity",
  devtools: "Developer Tools",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-spark/15 text-spark-foreground",
  low: "bg-muted text-muted-foreground",
};

const INTENSITY_COLORS: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-spark/15 text-spark-foreground",
  low: "bg-muted text-muted-foreground",
};

const MOMENTUM_COLORS: Record<string, string> = {
  accelerating: "bg-scout/15 text-scout",
  steady: "bg-spark/15 text-spark-foreground",
  emerging: "bg-primary/15 text-primary",
  declining: "bg-muted text-muted-foreground",
};

// --- Daily Brief structured data ---
interface DailyBriefData {
  date: string;
  overview: string;
  takeaway: string;
  stats: { articles: number; pain_signals: number; clusters: number };
  top_articles: { title: string; source: string; score: number; confidence: string; sectors: string[]; summary: string }[];
  sector_heatmap: { sector: string; count: number; pain_count: number }[];
  narratives: { name: string; count: number; trend: string; note: string }[];
  cross_signals: { article: string; pain_point: string; insight: string; strength: string }[];
}

// --- Topics structured data ---
interface TopicItem {
  title: string;
  trend_signal: { article: string; source: string; score: number; insight: string };
  pain_signals: { theme: string; severity?: string; signal_count?: number; description?: string; source?: string; mentions?: number; score?: number }[];
  core_question: string;
  sectors: string[];
}

interface GapItem {
  title: string;
  source: string;
  idea_potential: number;
  sectors: string[];
  narratives: string[];
  confidence: string;
  keyword_matches?: string[];
}

interface PainCluster {
  id: string;
  theme: string;
  trend: string;
  sector: string;
  avg_score: number;
  mention_count: number;
  keyword_matches?: string[];
}

interface TrendItem {
  sector: string;
  strength: number;
  news_count: number;
  pain_mentions: number;
}

export function ScoutReportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reportId = searchParams.get("id");

  const [report, setReport] = useState<ScoutReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingMarkdown, setExportingMarkdown] = useState(false);

  // --- Fetch report ---
  useEffect(() => {
    async function fetchReport() {
      if (!reportId) {
        // Use mock data in demo mode
        setReport(MOCK_REPORT);
        setIsLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("scout_reports")
          .select("*")
          .eq("id", reportId)
          .eq("user_id", user.id)
          .single();

        if (fetchError || !data) {
          setError("Report not found or access denied.");
          setIsLoading(false);
          return;
        }

        // If the run isn't done yet, the report is empty by definition.
        // Send the user to the pipeline page (which handles ?session=X)
        // so they see live progress instead of an empty-state dead end.
        if (data.status && data.status !== "complete") {
          router.replace(`/scout?session=${reportId}`);
          return;
        }

        setReport(data as ScoutReport);
      } catch {
        setError("Failed to load report.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchReport();
  }, [reportId, router]);

  // --- Fire analytics on load ---
  useEffect(() => {
    if (report && !isLoading) {
      const gaps = report.gaps as GapItem[] | null;
      trackScoutComplete({
        gap_count: Array.isArray(gaps) ? gaps.length : 0,
        report_id: report.id,
      });
    }
  }, [report, isLoading]);

  // --- Export functions ---
  const buildFullMarkdown = useCallback(() => {
    if (!report) return "";

    // Parse JSON in export context (same logic as render)
    let briefData: DailyBriefData | null = null;
    let topicsData: TopicItem[] = [];
    try {
      const bp = typeof report.daily_brief === "string" ? JSON.parse(report.daily_brief) : report.daily_brief;
      if (bp && typeof bp === "object" && "overview" in bp) briefData = bp as DailyBriefData;
    } catch { /* ignore */ }
    try {
      const tp = typeof report.topics === "string" ? JSON.parse(report.topics) : report.topics;
      if (Array.isArray(tp) && tp.length > 0 && "title" in tp[0]) topicsData = tp as TopicItem[];
    } catch { /* ignore */ }

    const sectors = (report.sectors ?? []) as string[];
    const lines: string[] = [
      `# Scout Report`,
      ``,
      `**Date:** ${new Date(report.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      `**Sectors:** ${sectors.map((s) => SECTOR_LABELS[s] || s).join(", ")}`,
      `**Model:** ${report.model || "—"}  |  **Tokens:** ${(report.total_input_tokens + report.total_output_tokens).toLocaleString()}  |  **Cost:** $${report.total_cost_usd?.toFixed(4) || "0"}`,
      ``,
      `---`,
    ];

    // Daily Brief
    if (briefData) {
      lines.push(``, `## Daily Brief`, ``);
      if (briefData.overview) lines.push(briefData.overview, ``);
      if (briefData.takeaway) lines.push(`> **Takeaway:** ${briefData.takeaway}`, ``);

      if (briefData.top_articles.length > 0) {
        lines.push(`### Top Signals`, ``);
        lines.push(`| # | Score | Article | Source | Summary |`, `|---|-------|---------|--------|---------|`);
        briefData.top_articles.forEach((a, i) => {
          lines.push(`| ${i + 1} | ${a.score} | ${a.title} | ${a.source} | ${a.summary || "—"} |`);
        });
        lines.push(``);
      }

      if (briefData.sector_heatmap.length > 0) {
        lines.push(`### Sector Density`, ``);
        lines.push(`| Sector | Signals | Pain |`, `|--------|---------|------|`);
        briefData.sector_heatmap.forEach((s) => lines.push(`| ${s.sector} | ${s.count} | ${s.pain_count} |`));
        lines.push(``);
      }

      if (briefData.narratives.length > 0) {
        lines.push(`### Narrative Trends`, ``);
        briefData.narratives.forEach((n) => {
          const icon = n.trend === "heating_up" ? "🔥" : n.trend === "cooling" ? "❄️" : "→";
          lines.push(`- ${icon} **${n.name}** (${n.count}) — ${n.note || n.trend}`);
        });
        lines.push(``);
      }

      if (briefData.cross_signals.length > 0) {
        lines.push(`### Cross-Signal Insights`, ``);
        briefData.cross_signals.forEach((cs) => {
          lines.push(`- **${cs.article}** × **${cs.pain_point}** [${cs.strength}]`);
          lines.push(`  ${cs.insight}`, ``);
        });
      }
    }

    // Topics
    if (topicsData.length > 0) {
      lines.push(`---`, ``, `## Startup Topics`, ``);
      topicsData.forEach((t, i) => {
        lines.push(`### ${i + 1}. ${t.title}`);
        if (t.sectors?.length) lines.push(`**Sectors:** ${t.sectors.join(", ")}`);
        lines.push(``);
        lines.push(`**Trend Signal:** ${t.trend_signal.article} (${t.trend_signal.score}) — ${t.trend_signal.source}`);
        lines.push(`> ${t.trend_signal.insight}`, ``);
        lines.push(`**Pain Signals:**`);
        t.pain_signals.forEach((ps) => {
          lines.push(`- ${ps.theme} (score: ${ps.score}${ps.mentions ? `, ${ps.mentions} mentions` : ""})`);
        });
        lines.push(``);
        lines.push(`**Core Question:** ${t.core_question}`, ``);
        lines.push(`---`, ``);
      });
    }

    lines.push(``, `*Generated by [GapSmith Scout](https://gapsmith-production.up.railway.app)*`);
    return lines.join("\n");
  }, [report]);

  const exportMarkdown = useCallback(() => {
    if (!report) return;
    setExportingMarkdown(true);
    const md = buildFullMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scout-report-${report.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setExportingMarkdown(false), 1000);
  }, [report, buildFullMarkdown]);

  const exportPdf = useCallback(() => {
    if (!report) return;
    const md = buildFullMarkdown();
    printHtmlReport(simpleMarkdownToHtml(md), `Scout Report — ${new Date(report.created_at).toLocaleDateString()}`, "#2dd4bf");
  }, [report, buildFullMarkdown]);

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-[960px] px-6 py-12">
          <ReportSkeleton />
        </div>
      </div>
    );
  }

  // --- Error / not found ---
  if (error || !report) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex max-w-[960px] flex-col items-center justify-center px-6 py-24">
          <BlurFade delay={0.1}>
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="relative h-48 w-48">
                <Image
                  src="/images/empty-state.webp"
                  alt="Report not found"
                  width={400}
                  height={400}
                  className="h-full w-full object-contain opacity-80"
                />
              </div>
              <h2
                className="font-heading text-3xl font-bold text-foreground"
                style={{ letterSpacing: "-1.5px", lineHeight: "1.08" }}
              >
                {error || "Report Not Found"}
              </h2>
              <p className="max-w-md text-muted-foreground" style={{ lineHeight: "1.55" }}>
                This report may have been deleted or you may not have access.
              </p>
              <Link
                href="/scout"
                className={buttonVariants({ variant: "default" }) + " rounded-full bg-scout px-8 text-background hover:opacity-90"}
              >
                Start New Report
              </Link>
            </div>
          </BlurFade>
        </div>
      </div>
    );
  }

  // --- Parse typed data from JSONB ---
  const gaps = (report.gaps ?? []) as GapItem[];
  const painClusters = (report.pain_clusters ?? []) as PainCluster[];
  const trends = (report.trends ?? []) as TrendItem[];
  const sectors = (report.sectors ?? []) as string[];
  const keywords = (report.keywords ?? []) as { keyword: string; count: number }[];

  // Parse structured JSON from daily_brief and topics (with fallback for old markdown reports)
  let briefData: DailyBriefData | null = null;
  let topicsData: TopicItem[] = [];
  let isLegacyMarkdown = false;

  try {
    const parsed = typeof report.daily_brief === "string" ? JSON.parse(report.daily_brief) : report.daily_brief;
    if (parsed && typeof parsed === "object" && "overview" in parsed) {
      briefData = parsed as DailyBriefData;
    }
  } catch {
    isLegacyMarkdown = true;
  }

  try {
    const parsed = typeof report.topics === "string" ? JSON.parse(report.topics) : report.topics;
    if (Array.isArray(parsed) && parsed.length > 0 && "title" in parsed[0]) {
      topicsData = parsed as TopicItem[];
    }
  } catch {
    // legacy markdown — handled below
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[960px] px-6 py-12">
        {/* Header */}
        <BlurFade delay={0.05}>
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-scout/15">
                  <span className="text-lg text-scout">📊</span>
                </div>
                <h1
                  className="font-heading text-4xl font-bold text-foreground"
                  style={{ letterSpacing: "-2px", lineHeight: "1.08" }}
                >
                  Scout Report
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {new Date(report.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-muted-foreground">·</span>
                {sectors.map((s) => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="bg-scout/10 text-scout"
                  >
                    {SECTOR_LABELS[s] || s}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={exportMarkdown}
                disabled={exportingMarkdown}
                className="rounded-full border-none text-sm transition-all duration-200"
                style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
              >
                {exportingMarkdown ? "Exported!" : "Export Markdown"}
              </Button>
              <Button
                variant="outline"
                onClick={exportPdf}
                className="rounded-full border-none text-sm transition-all duration-200"
                style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
              >
                Export PDF
              </Button>
            </div>
          </div>
        </BlurFade>

        {/* Stats strip */}
        <BlurFade delay={0.1}>
          <div className="mb-8 grid grid-cols-3 gap-4">
            <Card
              className="border-none bg-card"
              style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
            >
              <CardContent className="flex flex-col items-center gap-1 p-5">
                <div className="font-heading text-3xl font-bold text-scout" style={{ letterSpacing: "-1.5px" }}>
                  <NumberTicker value={briefData?.top_articles.length ?? gaps.length} />
                </div>
                <div className="text-xs text-muted-foreground">Signals</div>
              </CardContent>
            </Card>
            <Card
              className="border-none bg-card"
              style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
            >
              <CardContent className="flex flex-col items-center gap-1 p-5">
                <div className="font-heading text-3xl font-bold text-primary" style={{ letterSpacing: "-1.5px" }}>
                  <NumberTicker value={topicsData.length} />
                </div>
                <div className="text-xs text-muted-foreground">Topics</div>
              </CardContent>
            </Card>
            <Card
              className="border-none bg-card"
              style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
            >
              <CardContent className="flex flex-col items-center gap-1 p-5">
                <div className="font-heading text-3xl font-bold text-spark" style={{ letterSpacing: "-1.5px" }}>
                  <NumberTicker value={briefData?.narratives.length ?? trends.length} />
                </div>
                <div className="text-xs text-muted-foreground">Narratives</div>
              </CardContent>
            </Card>
          </div>
        </BlurFade>

        {/* Daily Brief — structured JSON rendering */}
        {briefData && (
          <>
            {/* Overview + Takeaway */}
            <BlurFade delay={0.12}>
              <Card className="mb-6 border-none bg-card" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-scout/15">
                      <span className="text-sm">📋</span>
                    </div>
                    <CardTitle className="font-heading text-lg font-bold" style={{ letterSpacing: "-0.5px" }}>Daily Brief</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground" style={{ lineHeight: "1.7" }}>{briefData.overview}</p>
                  {briefData.takeaway && (
                    <div className="flex gap-3 rounded-lg bg-scout/5 p-4" style={{ borderLeft: "3px solid oklch(0.72 0.12 178)" }}>
                      <span className="mt-0.5 text-scout">→</span>
                      <p className="text-sm font-medium text-foreground" style={{ lineHeight: "1.5" }}>{briefData.takeaway}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </BlurFade>

            {/* Top Articles */}
            {briefData.top_articles.length > 0 && (
              <BlurFade delay={0.15}>
                <div className="mb-6">
                  <h3 className="mb-3 font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">Top Signals</h3>
                  <div className="space-y-2">
                    {briefData.top_articles.map((a, i) => (
                      <BlurFade key={i} delay={0.02 * i}>
                        <div className="flex gap-3 rounded-lg bg-card p-3 transition-colors hover:bg-card/80" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 8%)" }}>
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-scout/10 text-xs font-bold text-scout">
                            {a.score.toFixed(1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground" style={{ letterSpacing: "-0.2px", lineHeight: "1.3" }}>{a.title}</div>
                            {a.summary && <p className="mt-1 text-xs text-muted-foreground" style={{ lineHeight: "1.5" }}>{a.summary}</p>}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground/70">{a.source}</span>
                              {a.sectors.map((s) => (
                                <Badge key={s} variant="secondary" className="bg-scout/8 px-1.5 py-0 text-[9px] text-scout">{s}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </BlurFade>
                    ))}
                  </div>
                </div>
              </BlurFade>
            )}

            {/* Sector Heatmap + Narratives side by side */}
            <BlurFade delay={0.18}>
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                {/* Sector Heatmap */}
                {briefData.sector_heatmap.length > 0 && (
                  <Card className="border-none bg-card" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sector Density</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {briefData.sector_heatmap.map((s) => {
                        const max = briefData!.sector_heatmap[0]?.count || 1;
                        const pct = Math.round((s.count / max) * 100);
                        return (
                          <div key={s.sector} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-xs font-medium text-foreground">{s.sector}</span>
                            <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-muted/30">
                              <div className="absolute inset-y-0 left-0 rounded-full bg-scout/30" style={{ width: `${pct}%` }} />
                              {s.pain_count > 0 && (
                                <div className="absolute inset-y-0 left-0 rounded-full bg-destructive/20" style={{ width: `${Math.round((s.pain_count / max) * 100)}%` }} />
                              )}
                            </div>
                            <span className="w-6 text-right text-[10px] text-muted-foreground">{s.count}</span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Narrative Trends */}
                {briefData.narratives.length > 0 && (
                  <Card className="border-none bg-card" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Narrative Trends</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {briefData.narratives.map((n) => (
                        <div key={n.name} className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{n.trend === "heating_up" ? "🔥" : n.trend === "cooling" ? "❄️" : "→"}</span>
                            <span className="text-xs font-semibold text-foreground">{n.name}</span>
                            <Badge variant="secondary" className="bg-muted px-1.5 py-0 text-[9px]">{n.count}</Badge>
                          </div>
                          {n.note && <p className="pl-7 text-[11px] text-muted-foreground" style={{ lineHeight: "1.4" }}>{n.note}</p>}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </BlurFade>

            {/* Cross-Signal Insights */}
            {briefData.cross_signals.length > 0 && (
              <BlurFade delay={0.2}>
                <div className="mb-8">
                  <h3 className="mb-3 font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide">Cross-Signal Insights</h3>
                  <div className="space-y-3">
                    {briefData.cross_signals.map((cs, i) => (
                      <Card key={i} className="border-none bg-card" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">⚡</div>
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-scout">{cs.article}</span>
                                <span className="text-muted-foreground">×</span>
                                <span className="font-semibold text-primary">{cs.pain_point}</span>
                                <Badge variant="secondary" className={cs.strength === "strong" ? "bg-scout/15 text-scout" : "bg-muted text-muted-foreground"}>
                                  {cs.strength}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground" style={{ lineHeight: "1.5" }}>{cs.insight}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </BlurFade>
            )}
          </>
        )}

        {/* Startup Topics — structured JSON rendering */}
        {topicsData.length > 0 && (
          <BlurFade delay={0.22}>
            <div className="mb-8">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                  <span className="text-sm">💡</span>
                </div>
                <h2 className="font-heading text-lg font-bold text-foreground" style={{ letterSpacing: "-0.5px" }}>Startup Topics</h2>
              </div>
              <div className="space-y-4">
                {topicsData.map((topic, i) => (
                  <BlurFade key={i} delay={0.05 * i}>
                    <Card className="border-none bg-card overflow-hidden" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)", borderLeft: "3px solid oklch(0.68 0.155 52)" }}>
                      <CardContent className="p-5 space-y-4">
                        {/* Title + Sectors */}
                        <div>
                          <h3 className="font-heading text-base font-bold text-foreground" style={{ letterSpacing: "-0.3px", lineHeight: "1.2" }}>{topic.title}</h3>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(topic.sectors || []).map((s) => (
                              <Badge key={s} variant="secondary" className="bg-scout/10 px-2 py-0 text-[10px] text-scout">{s}</Badge>
                            ))}
                          </div>
                        </div>

                        {/* Trend Signal */}
                        <div className="rounded-lg bg-scout/5 p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-scout">
                            <span>📈</span> Trend Signal
                          </div>
                          <div className="flex items-start gap-2">
                            <Badge className="mt-0.5 shrink-0 bg-scout/15 text-scout">{topic.trend_signal.score.toFixed(1)}</Badge>
                            <div>
                              <span className="text-xs font-semibold text-foreground">{topic.trend_signal.article}</span>
                              <span className="text-[10px] text-muted-foreground"> — {topic.trend_signal.source}</span>
                              <p className="mt-0.5 text-xs text-muted-foreground" style={{ lineHeight: "1.4" }}>{topic.trend_signal.insight}</p>
                            </div>
                          </div>
                        </div>

                        {/* Pain Signals */}
                        <div className="rounded-lg bg-destructive/5 p-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                            <span>🔴</span> Pain Signals
                          </div>
                          {topic.pain_signals.map((ps, j) => (
                            <div key={j} className="space-y-0.5">
                              <div className="flex items-center gap-2 text-xs">
                                <Badge variant="secondary" className={`shrink-0 ${
                                  ps.severity === "critical" ? "bg-destructive/15 text-destructive"
                                    : ps.severity === "moderate" ? "bg-spark/15 text-spark-foreground"
                                    : ps.score ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  {ps.severity || (ps.score ? ps.score.toFixed(1) : "—")}
                                </Badge>
                                <span className="font-medium text-foreground">{ps.theme}</span>
                                {(ps.signal_count || ps.mentions) ? <span className="text-muted-foreground">({ps.signal_count || ps.mentions} signals)</span> : null}
                              </div>
                              {ps.description && <p className="pl-12 text-[11px] text-muted-foreground" style={{ lineHeight: "1.4" }}>{ps.description}</p>}
                            </div>
                          ))}
                        </div>

                        {/* Core Question */}
                        <div className="flex gap-2 rounded-lg bg-primary/5 p-3" style={{ borderLeft: "3px solid oklch(0.68 0.155 52)" }}>
                          <span className="mt-0.5 text-primary font-bold">?</span>
                          <p className="text-sm font-medium text-foreground" style={{ lineHeight: "1.4" }}>{topic.core_question}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </BlurFade>
                ))}
              </div>
            </div>
          </BlurFade>
        )}

        {/* Legacy markdown fallback for old reports */}
        {isLegacyMarkdown && report.daily_brief && (
          <BlurFade delay={0.15}>
            <Card className="mb-8 border-none bg-card" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}>
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-lg font-bold" style={{ letterSpacing: "-0.5px" }}>Daily Brief</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="scout-markdown" suppressHydrationWarning>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.daily_brief}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </BlurFade>
        )}

        {/* Pain Clusters removed — covered by Topic Cards pain signals + Cross-Signal Insights */}

        {/* Trending Keywords — re-added 2026-04-29 after stopword + per-cluster
            cap fixes (commits 821e23d, 0bac16c) brought signal quality back. */}
        {keywords.length > 0 && (
          <BlurFade delay={0.26}>
            <Card className="mb-8 border-none bg-card" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}>
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-lg font-bold" style={{ letterSpacing: "-0.5px" }}>
                  Trending Keywords
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Words that recur across today&apos;s articles, pain signals, and clusters — bigger = mentioned more.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {keywords.slice(0, 24).map((k) => {
                    const max = keywords[0]?.count ?? 1;
                    const scale = 0.78 + 0.42 * Math.min(1, k.count / max);
                    return (
                      <span
                        key={k.keyword}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs"
                        style={{
                          fontSize: `${scale}rem`,
                          background: "oklch(0.96 0.012 85)",
                          color: "oklch(0.30 0.015 65)",
                          boxShadow: "0 0 0 1px oklch(0.88 0.015 75)",
                        }}
                        title={`${k.count} mentions`}
                      >
                        {k.keyword}
                        <span className="text-[10px] tabular-nums" style={{ color: "oklch(0.50 0.02 65)" }}>
                          {k.count}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </BlurFade>
        )}

        {/* Cost / token footer */}
        {(report.total_cost_usd > 0 || report.total_input_tokens > 0) && (
          <BlurFade delay={0.28}>
            <div className="mt-4 mb-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span>Model: {report.model}</span>
              <Separator orientation="vertical" className="h-3" />
              <span>{(report.total_input_tokens + report.total_output_tokens).toLocaleString()} tokens</span>
              <Separator orientation="vertical" className="h-3" />
              <span>${report.total_cost_usd.toFixed(4)} API cost</span>
            </div>
          </BlurFade>
        )}

        <Separator className="my-10 bg-border" />

        {/* Forward CTA -> /forge */}
        <BlurFade delay={0.35}>
          <Card
            className="border-none bg-card"
            style={{
              boxShadow:
                "0 0 0 1px oklch(0.92 0.015 85 / 10%), 0 0 30px oklch(0.68 0.155 52 / 8%)",
            }}
          >
            <CardContent className="flex flex-col items-center gap-5 p-8 text-center sm:flex-row sm:text-left">
              <div className="flex-1 space-y-2">
                <h3
                  className="font-heading text-2xl font-bold text-foreground"
                  style={{ letterSpacing: "-1px", lineHeight: "1.08" }}
                >
                  Ready to generate ideas?
                </h3>
                <p className="text-sm text-muted-foreground" style={{ lineHeight: "1.55" }}>
                  Feed this Scout report into Forge to brainstorm 5 rounds of startup ideas
                  with AI Proposer and Defender agents.
                </p>
              </div>
              <Link
                href={`/forge${reportId ? `?scout_report_id=${reportId}` : ""}`}
                className={buttonVariants({ variant: "default" }) + " rounded-full bg-primary px-8 py-3 text-base font-bold text-primary-foreground transition-all duration-200 hover:opacity-90"}
                style={{
                  boxShadow: "0 0 20px oklch(0.68 0.155 52 / 15%)",
                }}
              >
                Generate Ideas from This Report
              </Link>
            </CardContent>
          </Card>
        </BlurFade>

        {/* Secondary actions */}
        <BlurFade delay={0.4}>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/scout"
              className={buttonVariants({ variant: "outline" }) + " rounded-full border-none text-sm"}
              style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
            >
              New Scout Report
            </Link>
          </div>
        </BlurFade>
      </div>
    </div>
  );
}

// --- Empty state for tabs ---
function EmptyTabState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="relative h-32 w-32 opacity-70">
        <Image
          src="/images/empty-state.webp"
          alt="No data yet"
          width={400}
          height={400}
          className="h-full w-full object-contain"
        />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// --- Loading skeleton ---
function ReportSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg bg-muted" />
          <Skeleton className="h-10 w-64 bg-muted" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-5 w-32 bg-muted" />
          <Skeleton className="h-5 w-20 bg-muted" />
          <Skeleton className="h-5 w-20 bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className="h-24 rounded-lg bg-muted"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-full bg-muted" />
        <Skeleton className="h-9 w-32 rounded-full bg-muted" />
        <Skeleton className="h-9 w-20 rounded-full bg-muted" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className="h-36 rounded-lg bg-muted"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
