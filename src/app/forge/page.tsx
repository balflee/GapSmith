"use client";

import { useEffect, useState, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { Marquee } from "@/components/ui/marquee";
import { Meteors } from "@/components/ui/meteors";
import { Ripple } from "@/components/ui/ripple";
import { OrbitingCircles } from "@/components/ui/orbiting-circles";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trackForgeStart } from "@/lib/events";
import { createClient } from "@/lib/supabase";
import type { ScoutReport } from "@/lib/types";
import { parseSessionConfig, summarizeSessionConfig } from "@/lib/session-config";
import type { RealtimeChannel } from "@supabase/supabase-js";

// --- Forge Skeleton (ember-tinted shimmer) ---
function ForgeCardSkeleton() {
  return (
    <div className="rounded-[8px] overflow-hidden relative" style={{
      background: "oklch(0.96 0.008 85)",
      boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)",
    }}>
      <div className="p-6 space-y-4">
        <div className="h-5 w-2/3 rounded-[4px] animate-pulse" style={{ background: "linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.03 52), oklch(0.92 0.010 75))", backgroundSize: "200% 100%", animation: "ember-shimmer 1.8s ease-in-out infinite" }} />
        <div className="h-4 w-full rounded-[4px] animate-pulse" style={{ background: "linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.025 52), oklch(0.92 0.010 75))", backgroundSize: "200% 100%", animation: "ember-shimmer 1.8s ease-in-out infinite 0.1s" }} />
        <div className="h-4 w-4/5 rounded-[4px] animate-pulse" style={{ background: "linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.025 52), oklch(0.92 0.010 75))", backgroundSize: "200% 100%", animation: "ember-shimmer 1.8s ease-in-out infinite 0.2s" }} />
      </div>
      <style>{`@keyframes ember-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
}

// --- Round display component ---
interface RoundData {
  round: number;
  proposer: string;
  defender: string;
}

// --- Skeleton shimmer for loading state ---
function ShimmerLines({ count = 3, baseWidth = 85, step = 15, hue = "52" }: { count?: number; baseWidth?: number; step?: number; hue?: string }) {
  return (
    <div className="space-y-2">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="h-3.5 rounded-[4px]" style={{ width: `${baseWidth - i * step}%`, background: `linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.03 ${hue}), oklch(0.92 0.010 75))`, backgroundSize: "200% 100%", animation: `ember-shimmer 1.8s ease-in-out infinite ${i * 0.1}s` }} />
      ))}
      <style>{`@keyframes ember-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
}

// --- Markdown section with collapse for long content ---
function AgentOutput({ content, accentColor }: { content: string; accentColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n").length;
  const isLong = lines > 20;

  return (
    <div className="relative">
      <div
        className="prose-sm pl-4 overflow-hidden"
        style={{
          maxHeight: isLong && !expanded ? "280px" : "none",
          color: "oklch(0.35 0.015 65)",
          lineHeight: "1.6",
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1" style={{ color: "oklch(0.24 0.012 65)" }}>{children}</h3>,
            h2: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1" style={{ color: "oklch(0.24 0.012 65)" }}>{children}</h4>,
            h3: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1" style={{ color: "oklch(0.30 0.015 65)" }}>{children}</h5>,
            p: ({ children }) => <p className="text-sm mb-2" style={{ lineHeight: "1.6" }}>{children}</p>,
            ul: ({ children }) => <ul className="text-sm mb-2 pl-4 list-disc space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="text-sm mb-2 pl-4 list-decimal space-y-0.5">{children}</ol>,
            li: ({ children }) => <li className="text-sm" style={{ lineHeight: "1.5" }}>{children}</li>,
            strong: ({ children }) => <strong className="font-semibold" style={{ color: "oklch(0.24 0.012 65)" }}>{children}</strong>,
            table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
            th: ({ children }) => <th className="text-left px-2 py-1 font-semibold border-b" style={{ borderColor: "oklch(0.90 0.010 75)", color: "oklch(0.30 0.015 65)" }}>{children}</th>,
            td: ({ children }) => <td className="px-2 py-1 border-b" style={{ borderColor: "oklch(0.94 0.008 75)" }}>{children}</td>,
            code: ({ children }) => <code className="text-xs px-1 py-0.5 rounded" style={{ background: "oklch(0.94 0.008 75)", color: "oklch(0.45 0.02 65)" }}>{children}</code>,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {isLong && !expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-16 flex items-end justify-center" style={{
          background: "linear-gradient(transparent, oklch(0.99 0.005 85))",
        }}>
          <button
            onClick={() => setExpanded(true)}
            className="text-xs font-medium px-4 py-1 mb-1 rounded-full transition-all"
            style={{ color: accentColor, boxShadow: `0 0 0 1px ${accentColor}33` }}
          >
            Show more
          </button>
        </div>
      )}
      {isLong && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs font-medium px-4 py-1 mt-1 rounded-full transition-all"
          style={{ color: accentColor, boxShadow: `0 0 0 1px ${accentColor}33` }}
        >
          Show less
        </button>
      )}
    </div>
  );
}

function RoundCard({ data, index, isStreaming }: { data: RoundData; index: number; isStreaming: boolean }) {
  return (
    <BlurFade delay={0.08 * index} inView>
      <Card className="relative overflow-hidden transition-all duration-300 hover:translate-y-[-2px]" style={{
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 0 30px rgba(212, 116, 60, 0.05)",
        borderRadius: "8px",
        border: "none",
      }}>
        {isStreaming && <BorderBeam size={120} duration={3} colorFrom="oklch(0.62 0.155 52)" colorTo="oklch(0.78 0.155 75)" />}
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px", lineHeight: "1.08" }}>
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold" style={{ background: "oklch(0.68 0.155 52 / 15%)", color: "oklch(0.62 0.155 52)" }}>
              {data.round}
            </span>
            Round {data.round}
            {isStreaming && (
              <Badge variant="secondary" className="ml-auto animate-pulse" style={{ background: "oklch(0.68 0.155 52 / 15%)", color: "oklch(0.62 0.155 52)" }}>
                Forging...
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "oklch(0.62 0.155 52)" }} />
              <span className="text-sm font-medium" style={{ color: "oklch(0.62 0.155 52)" }}>Proposer</span>
            </div>
            {data.proposer
              ? <AgentOutput content={data.proposer} accentColor="oklch(0.62 0.155 52)" />
              : <div className="pl-4"><ShimmerLines hue="52" /></div>
            }
          </div>
          <div className="w-full h-px" style={{ background: "oklch(0.24 0.012 65 / 10%)" }} />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "oklch(0.72 0.12 178)" }} />
              <span className="text-sm font-medium" style={{ color: "oklch(0.72 0.12 178)" }}>Defender</span>
            </div>
            {data.defender
              ? <AgentOutput content={data.defender} accentColor="oklch(0.72 0.12 178)" />
              : <div className="pl-4"><ShimmerLines hue="178" /></div>
            }
          </div>
        </CardContent>
      </Card>
    </BlurFade>
  );
}

// --- Model cost estimates (Forge tier — multi-round ideation) ---
// Excludes Sonnet 4.6, Gemini Flash variants, and Grok (all sizes): observed
// quality drop in 5-round screening. Those models are still offered on Scout.
// MiniMax remains the balanced default (~$0.45/run, quality 8-9/10).
const MODEL_COSTS: Record<string, { name: string; costPerRound: number }> = {
  "claude-opus-4-7": { name: "Claude Opus 4.7", costPerRound: 1.25 },
  "claude-opus-4-6": { name: "Claude Opus 4.6", costPerRound: 1.25 },
  "gpt-5.5-pro": { name: "GPT-5.5 Pro", costPerRound: 3.50 },
  "gpt-5.5": { name: "GPT-5.5", costPerRound: 0.65 },
  "gpt-5.4-pro": { name: "GPT-5.4 Pro", costPerRound: 3.50 },
  "gpt-5.4": { name: "GPT-5.4", costPerRound: 0.30 },
  "gpt-5.4-mini": { name: "GPT-5.4 Mini", costPerRound: 0.09 },
  "gpt-5.4-nano": { name: "GPT-5.4 Nano", costPerRound: 0.025 },
  "gemini-3.1-pro-preview": { name: "Gemini 3.1 Pro (preview)", costPerRound: 0.65 },
  "gemini-2.5-pro": { name: "Gemini 2.5 Pro", costPerRound: 0.50 },
  "MiniMax-M1": { name: "MiniMax-M1", costPerRound: 0.12 },
  "MiniMax-M2.5": { name: "MiniMax-M2.5", costPerRound: 0.08 },
  "MiniMax-M2.7": { name: "MiniMax-M2.7", costPerRound: 0.08 },
};

// --- Guided input field ---
function GuidedField({ id, label, placeholder, value, onChange, hint, rows = 2 }: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium" style={{ color: "oklch(0.35 0.015 65)" }}>
        {label}
      </Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full text-sm rounded-[6px] px-4 py-2.5 resize-y transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[oklch(0.68_0.155_52/50%)]"
        style={{
          background: "oklch(0.96 0.008 80)",
          color: "oklch(0.24 0.012 65)",
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06)",
          lineHeight: "1.55",
        }}
      />
      <div className="text-xs" style={{ color: "oklch(0.55 0.02 65)" }}>
        {hint}
      </div>
    </div>
  );
}

// --- Error message formatting ---
//
// The engine writes failure detail into forge_sessions.progress_message.
// On a classified-upstream failure that triggered a quota refund, the
// engine appends the sentinel `[quota_refunded]` to that string (see
// engine/api.py QUOTA_REFUNDED_MARKER). We strip it here so the title /
// message stays clean, then surface it as a separate green sub-line
// near the retry buttons.
const QUOTA_REFUNDED_MARKER = "[quota_refunded]";

function wasQuotaRefunded(error: string): boolean {
  return error.includes(QUOTA_REFUNDED_MARKER);
}

function stripQuotaMarker(error: string): string {
  return error.replace(QUOTA_REFUNDED_MARKER, "").trim();
}

function formatErrorTitle(error: string): string {
  const lower = stripQuotaMarker(error).toLowerCase();
  if (lower.includes("overload") || lower.includes("high load") || lower.includes("529")) {
    return "AI Model Temporarily Overloaded";
  }
  if (lower.includes("503") || lower.includes("service unavailable") || lower.includes("unavailable")) {
    return "AI Provider Temporarily Down";
  }
  if (lower.includes("rate") || lower.includes("429") || lower.includes("too many requests") || lower.includes("quota")) {
    return "Rate Limit Reached";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Request Timed Out";
  }
  if (lower.includes("connection") || lower.includes("network")) {
    return "Network Connection Issue";
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return "API Key Issue";
  }
  return "Something Went Wrong";
}

function formatErrorMessage(error: string): string {
  const cleaned = stripQuotaMarker(error);
  const lower = cleaned.toLowerCase();
  if (lower.includes("overload") || lower.includes("high load") || lower.includes("529")) {
    return "The AI model provider is experiencing high traffic. This is temporary — please wait a few minutes and try again.";
  }
  if (lower.includes("503") || lower.includes("service unavailable") || lower.includes("unavailable")) {
    return "The AI model provider's API is currently unavailable. This is on their end, not yours — try again in a few minutes, or switch to a different model in Settings.";
  }
  if (lower.includes("rate") || lower.includes("429") || lower.includes("too many requests") || lower.includes("quota")) {
    return "You've hit the API rate limit. Please wait a moment before trying again, or consider switching to a different model.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The request took too long to complete. This can happen with complex contexts. Try again or simplify your input.";
  }
  if (lower.includes("connection") || lower.includes("network")) {
    return "Could not reach the AI provider. Check your internet connection or try again in a moment.";
  }
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return "Your API key may be invalid or expired. Check your Settings page and update your key.";
  }
  // For unknown errors, show a cleaned up version
  const trimmed = cleaned.replace(/^Error:\s*/i, "").replace(/litellm\.\w+:\s*/gi, "").substring(0, 200);
  return trimmed || "An unexpected error occurred. Please try again.";
}

// --- Product modes (matches CLI venture-ideate) ---
const PRODUCT_MODES = [
  "Web App (SaaS)", "Mobile App", "Desktop Software", "Browser Extension",
  "API / Developer Tool", "CLI Tool", "Web3 Protocol / DApp", "AI Agent",
  "Marketplace / Platform", "Hardware + Software (IoT)", "No-code / Low-code Tool",
  "Data Product / Analytics", "Content / Media Platform", "SDK / Library / Framework",
  "Telegram / Discord Bot", "Workflow Automation", "Orchestration Layer",
] as const;

// --- Main Forge Content (uses useSearchParams) ---
function ForgeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const scoutReportId = searchParams.get("from_scout");
  const [sourceTab, setSourceTab] = useState<string>(scoutReportId ? "scout" : "manual");
  const [scoutReport, setScoutReport] = useState<ScoutReport | null>(null);
  const [manualContext, setManualContext] = useState("");
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [customMode, setCustomMode] = useState("");
  const [showCustomMode, setShowCustomMode] = useState(false);
  const [guidedInputs, setGuidedInputs] = useState({
    market: "",
    audience: "",
    painPoints: "",
    constraints: "",
    extra: "",
  });
  const [selectedModel, setSelectedModel] = useState("gpt-5.4");
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!scoutReportId);
  const [recentReports, setRecentReports] = useState<Array<{ id: string; sectors: string[]; label: string; created_at: string; status: string }>>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<{ time: string; msg: string }[]>([]);
  const [pastSessions, setPastSessions] = useState<Array<{
    id: string; status: string; created_at: string; model: string | null;
    total_cost_usd: number | null; top_ideas: Array<{ name: string }> | null;
    label: string; session_config: string;
  }>>([]);
  const [loadingPastSessions, setLoadingPastSessions] = useState(false);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // SESSION_CONFIG (Project Context) — improves Analyst / lean-feasibility accuracy.
  // Default open so users don't forget to fill it; without this, agents fall back to
  // generic Small Team / $10K / $100K assumptions that don't match many users.
  const [showContext, setShowContext] = useState(true);
  const [profile, setProfile] = useState<string>("Small Team (4-5)");
  const [budget, setBudget] = useState<string>("$10K");
  const [timeline, setTimeline] = useState<string>("4-8 weeks");
  const [revenueThreshold, setRevenueThreshold] = useState<string>("$100K/year");
  const [founderSignal, setFounderSignal] = useState<string>("");
  const roundsEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stallCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Active session id ref — used by the URL-resume effect to skip
  // re-attaching to a session we're already watching.
  const activeForgeIdRef = useRef<string | null>(null);
  const TOTAL_ROUNDS = 5;

  // Fetch past forge sessions
  useEffect(() => {
    async function loadPastSessions() {
      setLoadingPastSessions(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingPastSessions(false); return; }
      const { data } = await supabase
        .from("forge_sessions")
        .select("id, status, created_at, model, total_cost_usd, top_ideas, label, session_config")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setPastSessions(data as typeof pastSessions);
      setLoadingPastSessions(false);
    }
    loadPastSessions();
    // eslint-disable-next-line
  }, []);

  // Load scout report if coming from URL param
  useEffect(() => {
    if (!scoutReportId) return;
    async function loadReport() {
      const { data } = await supabase
        .from("scout_reports")
        .select("*")
        .eq("id", scoutReportId)
        .single();
      if (data) setScoutReport(data as unknown as ScoutReport);
      setLoading(false);
    }
    loadReport();
    // eslint-disable-next-line
  }, [scoutReportId]);

  // Fetch recent completed scout reports for picker
  useEffect(() => {
    if (scoutReportId) return; // already have one from URL
    async function loadRecentReports() {
      setLoadingReports(true);
      const { data } = await supabase
        .from("scout_reports")
        .select("id, sectors, label, created_at, status")
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setRecentReports(data as Array<{ id: string; sectors: string[]; label: string; created_at: string; status: string }>);
      setLoadingReports(false);
    }
    loadRecentReports();
    // eslint-disable-next-line
  }, []);

  // Auto-scroll to latest round
  useEffect(() => {
    // Scroll only if the new round end is below the viewport — and use
    // block: "nearest" so we never yank when the user is reading earlier
    // rounds. Skip entirely on the first round so the user sees the
    // brainstorm start at the top.
    if (rounds.length === 0) return;
    const el = roundsEndRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [rounds]);

  // Auto-scroll activity log
  useEffect(() => {
    // Tail the inner log container only — never the page.
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logEntries]);

  // Cleanup Realtime on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      if (stallCheckRef.current) {
        clearInterval(stallCheckRef.current);
      }
    };
  }, []);

  // Build structured context from guided inputs
  const buildManualContext = () => {
    const parts: string[] = [];
    const allModes = [...selectedModes, ...(customMode.trim() ? [customMode.trim()] : [])];
    if (allModes.length > 0) parts.push(`## Product Modes\n${allModes.join(", ")}`);
    if (guidedInputs.market) parts.push(`## Market / Industry\n${guidedInputs.market}`);
    if (guidedInputs.audience) parts.push(`## Target Audience\n${guidedInputs.audience}`);
    if (guidedInputs.painPoints) parts.push(`## Pain Points & Problems\n${guidedInputs.painPoints}`);
    if (guidedInputs.constraints) parts.push(`## Constraints & Preferences\n${guidedInputs.constraints}`);
    if (guidedInputs.extra) parts.push(`## Additional Context\n${guidedInputs.extra}`);
    return parts.join("\n\n");
  };

  const estimatedCost = (MODEL_COSTS[selectedModel]?.costPerRound ?? 0.20) * (TOTAL_ROUNDS + 1);
  const hasGuidedContent = guidedInputs.market.trim().length > 0 && guidedInputs.painPoints.trim().length > 0;
  // canStart fully defined below buildSessionConfig (needs the joined
  // session_config string length to enforce the backend max(5000) limit).
  // Backend zod limits — keep in sync with src/app/api/forge/start/route.ts.
  const CONTEXT_MAX_LENGTH = 10000;
  const SESSION_CONFIG_MAX_LENGTH = 5000;
  const manualContextLength = sourceTab === "manual" ? buildManualContext().length : 0;
  const contextTooLong = manualContextLength > CONTEXT_MAX_LENGTH;

  // Build SESSION_CONFIG.md markdown from form state (only emit when something differs from defaults)
  const buildSessionConfig = () => {
    const hasAny =
      profile !== "Small Team (4-5)" ||
      budget !== "$10K" ||
      timeline !== "4-8 weeks" ||
      revenueThreshold !== "$100K/year" ||
      founderSignal.trim() !== "";
    if (!hasAny) return "";
    const lines = [
      "# Session Config",
      "",
      "## Project Profile",
      `Profile: ${profile}`,
      `Budget: ${budget}`,
      `Timeline: ${timeline}`,
      `Revenue_threshold: ${revenueThreshold}`,
    ];
    if (founderSignal.trim()) {
      lines.push("", "## Founder Signal", `Signal: ${founderSignal.trim()}`);
    }
    return lines.join("\n");
  };

  // Final canStart now that buildSessionConfig is in scope. Without these
  // checks, pasting a long doc into Pain Points / Additional Context (or
  // a giant Founder Signal) silently 400's at /api/forge/start.
  const sessionConfigLength = buildSessionConfig().length;
  const sessionConfigTooLongForge = sessionConfigLength > SESSION_CONFIG_MAX_LENGTH;
  const canStart =
    !contextTooLong &&
    !sessionConfigTooLongForge &&
    (sourceTab === "scout" ? !!scoutReport : hasGuidedContent);

  const handleStart = async () => {
    console.log("[FORGE] handleStart clicked, canStart=", canStart, "isRunning=", isRunning, "sourceTab=", sourceTab);
    if (!canStart || isRunning) return;
    // Snap the viewport to the top so the user sees the running-state header
    // (and the warming-up animation) without having to scroll up manually.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setIsRunning(true);
    setCurrentRound(0);
    setRounds([]);
    setProgress(0);
    setProgressMessage("");
    setError(null);
    setLogEntries([]);

    const source = sourceTab === "scout" ? "from_scout" : "manual";
    const resolvedScoutId = scoutReportId || scoutReport?.id || undefined;
    trackForgeStart({ source, scout_report_id: resolvedScoutId });

    try {
      const response = await fetch("/api/forge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scout_report_id: resolvedScoutId,
          context: sourceTab === "manual" ? buildManualContext() : undefined,
          product_modes: [...selectedModes, ...(customMode.trim() ? [customMode.trim()] : [])],
          model: selectedModel,
          session_config: buildSessionConfig(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 402 && errorData.reason === "quota_exhausted") {
          alert(
            `You've used all ${errorData.total} included Forge sessions this year.\n\n` +
            `For more Forge sessions, order our premium Done-For-You service ($99, ` +
            `Claude Opus + human-reviewed).`,
          );
          window.location.href = errorData.upsell_url ?? "/pricing#done-for-you";
          return;
        }
        if (errorData.reason === "no_api_key") {
          alert("Set your LLM provider API key first. Redirecting to Settings...");
          router.push(errorData.redirect_to ?? "/settings");
          return;
        }
        throw new Error(errorData.error || "Failed to start forge session");
      }

      const { id: forgeId } = await response.json();
      setSessionId(forgeId);

      // Push id into URL so refresh / tab-restore / "Past Sessions" click
      // resumes the same in-flight run instead of losing the reference.
      router.replace(`/forge?session=${forgeId}`, { scroll: false });

      watchForgeSession(forgeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start forge session");
      setIsRunning(false);
    }
  };

  // Subscribe to a Forge session's Realtime + 10s polling fallback.
  // Extracted from inline handleStart so the URL-resume effect (and the
  // Past Sessions resume click) reuse the same observer with all its
  // log dedup, heartbeat, and rounds-tracking logic. Idempotent — calling
  // it again for a different id tears down the previous subscription.
  function watchForgeSession(forgeId: string) {
    channelRef.current?.unsubscribe();
    if (stallCheckRef.current) clearInterval(stallCheckRef.current);
    activeForgeIdRef.current = forgeId;

    let lastProgressTime = Date.now();
    // Heartbeat tracking — Gemini and Claude with native web search can
    // sit on one phase ("Pain point search...") for 5-10 minutes silently.
    // Without a heartbeat the activity log shows nothing for that window
    // and users assume the run is stuck.
    let lastHeartbeatShown = Date.now();
    let currentPhaseLabel = "";

    const channel = supabase
      .channel(`forge-progress-${forgeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "forge_sessions",
          filter: `id=eq.${forgeId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as {
            progress: number;
            progress_message: string;
            status: string;
            rounds: RoundData[] | null;
          };

          lastProgressTime = Date.now();
          lastHeartbeatShown = Date.now();
          if (row.progress_message) currentPhaseLabel = row.progress_message;

          setProgress(row.progress);
          setProgressMessage(row.progress_message);

          if (row.progress_message) {
            const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
            setLogEntries((prev) => {
              if (prev.length > 0 && prev[prev.length - 1].msg === row.progress_message) return prev;
              return [...prev, { time, msg: row.progress_message }];
            });
          }

          if (row.rounds && row.rounds.length > 0) {
            setRounds(row.rounds);
            setCurrentRound(row.rounds.length);
          }

          if (row.status === "complete") {
            setProgress(100);
            setIsRunning(false);
            setTimeout(() => router.push(`/forge-report?id=${forgeId}`), 1500);
            channel.unsubscribe();
            channelRef.current = null;
          } else if (row.status === "error") {
            setError(row.progress_message || "The session encountered an error. Please try again.");
            setIsRunning(false);
            channel.unsubscribe();
            channelRef.current = null;
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    stallCheckRef.current = setInterval(async () => {
      if (!channelRef.current) {
        clearInterval(stallCheckRef.current!);
        return;
      }

      const sinceProgress = Date.now() - lastProgressTime;
      const sinceHeartbeat = Date.now() - lastHeartbeatShown;
      if (sinceProgress > 90_000 && sinceHeartbeat > 60_000 && currentPhaseLabel) {
        const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const elapsedMin = Math.max(1, Math.round(sinceProgress / 60_000));
        const heartbeatMsg = `Still working on "${currentPhaseLabel}" — ${elapsedMin}m+ in. Native-search models (Gemini, Claude) often take 5–10 min per step.`;
        setLogEntries((prev) => [...prev, { time, msg: heartbeatMsg }]);
        lastHeartbeatShown = Date.now();
      }

      try {
        const check = await fetch(`/api/forge/${forgeId}`);
        if (!check.ok) return;
        const data = await check.json();

        if (data.progress !== undefined) {
          setProgress(data.progress);
        }
        if (data.progress_message) {
          setProgressMessage(data.progress_message);
          const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setLogEntries((prev) => {
            if (prev.length > 0 && prev[prev.length - 1].msg === data.progress_message) return prev;
            return [...prev, { time, msg: data.progress_message }];
          });
          lastProgressTime = Date.now();
          lastHeartbeatShown = Date.now();
          currentPhaseLabel = data.progress_message;
        }
        if (data.rounds && Array.isArray(data.rounds) && data.rounds.length > 0) {
          setRounds(data.rounds);
          setCurrentRound(data.rounds.length);
        }

        if (data.status === "error") {
          setError(data.progress_message || "The session encountered an error. Please try again.");
          setIsRunning(false);
          channel.unsubscribe();
          channelRef.current = null;
          clearInterval(stallCheckRef.current!);
        } else if (data.status === "complete") {
          setProgress(100);
          setIsRunning(false);
          if (data.rounds && Array.isArray(data.rounds)) setRounds(data.rounds);
          setTimeout(() => router.push(`/forge-report?id=${forgeId}`), 1500);
          channel.unsubscribe();
          channelRef.current = null;
          clearInterval(stallCheckRef.current!);
        }
      } catch {
        // ignore poll errors
      }
    }, 10_000);
  }

  // --- Resume from URL ---
  // ?session=<id> resumes an in-flight run after a refresh, tab-restore,
  // or "Past Sessions" click. ?from_scout=<id> is a separate, pre-existing
  // pre-fill mechanism for the form — both can coexist (different keys);
  // ?session takes priority because it represents a live run.
  useEffect(() => {
    const sid = searchParams.get("session");
    if (!sid) return;
    if (activeForgeIdRef.current === sid) return;

    let cancelled = false;
    (async () => {
      const { data, error: fetchErr } = await supabase
        .from("forge_sessions")
        .select("id, status, progress, progress_message, rounds")
        .eq("id", sid)
        .maybeSingle();
      if (cancelled || !data || fetchErr) return;

      if (data.status === "complete") {
        router.replace(`/forge-report?id=${sid}`);
        return;
      }
      if (data.status === "error") {
        setError(data.progress_message || "The session ended with an error.");
        setIsRunning(false);
        activeForgeIdRef.current = sid;
        return;
      }

      // Hydrate visible state, then attach observer.
      setSessionId(sid);
      setIsRunning(true);
      setProgress(data.progress ?? 0);
      setProgressMessage(data.progress_message ?? "");
      if (data.rounds && Array.isArray(data.rounds)) {
        setRounds(data.rounds as RoundData[]);
        setCurrentRound((data.rounds as RoundData[]).length);
      }
      watchForgeSession(sid);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="min-w-0 w-full overflow-x-hidden">
      {/* Header Section */}
      <BlurFade delay={0}>
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
              background: "oklch(0.68 0.155 52 / 15%)",
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L12.5 7.5L18 10L12.5 12.5L10 18L7.5 12.5L2 10L7.5 7.5L10 2Z" fill="oklch(0.62 0.155 52)" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-2px", lineHeight: "1.08", color: "oklch(0.24 0.012 65)" }}>
                Forge
              </h1>
              <div className="text-sm" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                AI-powered brainstorming with Proposer + Defender dynamics
              </div>
            </div>
          </div>
        </div>
      </BlurFade>

      {!isRunning && rounds.length === 0 && (
        <>
          {/* Product Modes (shared across both tabs) */}
          <BlurFade delay={0.06}>
            <Card className="mb-6" style={{
              boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)",
              borderRadius: "8px",
              border: "none",
            }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                  Product Modes
                </CardTitle>
                <div className="text-sm mt-0.5" style={{ color: "oklch(0.45 0.02 65)" }}>
                  What kind of product should ideas focus on? Select all that apply, or leave empty for no constraint.
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {PRODUCT_MODES.map((mode) => {
                    const active = selectedModes.includes(mode);
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSelectedModes(prev =>
                          active ? prev.filter(m => m !== mode) : [...prev, mode]
                        )}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                        style={{
                          background: active ? "oklch(0.62 0.155 52 / 12%)" : "oklch(0.96 0.008 80)",
                          color: active ? "oklch(0.62 0.155 52)" : "oklch(0.45 0.02 65)",
                          boxShadow: active
                            ? "0 0 0 1.5px oklch(0.68 0.155 52 / 50%)"
                            : "0 0 0 1px rgba(0, 0, 0, 0.06)",
                        }}
                      >
                        {mode}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowCustomMode(prev => !prev)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                    style={{
                      background: showCustomMode || customMode.trim() ? "oklch(0.62 0.155 52 / 12%)" : "oklch(0.96 0.008 80)",
                      color: showCustomMode || customMode.trim() ? "oklch(0.62 0.155 52)" : "oklch(0.45 0.02 65)",
                      boxShadow: showCustomMode || customMode.trim()
                        ? "0 0 0 1.5px oklch(0.68 0.155 52 / 50%)"
                        : "0 0 0 1px rgba(0, 0, 0, 0.06)",
                    }}
                  >
                    + Other
                  </button>
                </div>
                {showCustomMode && (
                  <input
                    type="text"
                    value={customMode}
                    onChange={(e) => setCustomMode(e.target.value)}
                    placeholder="e.g., Voice-first assistant, Slack integration..."
                    className="w-full text-sm rounded-[6px] px-3 py-2 mt-2 transition-all duration-200 focus:outline-none"
                    style={{
                      background: "oklch(0.96 0.008 80)",
                      color: "oklch(0.24 0.012 65)",
                      boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06)",
                    }}
                    onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px oklch(0.68 0.155 52 / 50%)"; }}
                    onBlur={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.06)"; }}
                    autoFocus
                  />
                )}
              </CardContent>
            </Card>
          </BlurFade>

          {/* Source Selection */}
          <BlurFade delay={0.12}>
            <Tabs value={sourceTab} onValueChange={setSourceTab} className="mb-6">
              <TabsList className="grid w-full grid-cols-2" style={{ background: "oklch(0.93 0.012 75)", borderRadius: "8px" }}>
                <TabsTrigger value="scout" style={{ borderRadius: "6px" }}>
                  From Scout Report
                </TabsTrigger>
                <TabsTrigger value="manual" style={{ borderRadius: "6px" }}>
                  Manual Context
                </TabsTrigger>
              </TabsList>

              <TabsContent value="scout" className="mt-4">
                {loading ? (
                  <ForgeCardSkeleton />
                ) : scoutReport ? (
                  <Card style={{
                    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 0 20px rgba(212, 116, 60, 0.05)",
                    borderRadius: "8px",
                    border: "none",
                  }}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                          {(scoutReport as unknown as { label?: string }).label || "Scout Report"}
                        </CardTitle>
                        <button
                          onClick={() => { setScoutReport(null); }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Change
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(scoutReport.sectors as string[])?.map((s: string) => (
                          <Badge key={s} variant="secondary" style={{ background: "oklch(0.72 0.12 178 / 12%)", color: "oklch(0.72 0.12 178)", borderRadius: "4px" }}>
                            {s}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-sm" style={{ color: "oklch(0.45 0.02 65)" }}>
                        {Array.isArray(scoutReport.gaps) ? `${(scoutReport.gaps as unknown[]).length} gaps identified` : "Report loaded"} -- ready to generate ideas
                      </div>
                    </CardContent>
                  </Card>
                ) : loadingReports ? (
                  <ForgeCardSkeleton />
                ) : recentReports.length > 0 ? (
                  <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                        Select a Scout Report
                      </CardTitle>
                      <div className="text-sm mt-0.5" style={{ color: "oklch(0.45 0.02 65)" }}>
                        Pick a completed report to use as brainstorm context.
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {recentReports.map((report) => (
                        <button
                          key={report.id}
                          type="button"
                          onClick={async () => {
                            setLoading(true);
                            const { data } = await supabase
                              .from("scout_reports")
                              .select("*")
                              .eq("id", report.id)
                              .single();
                            if (data) setScoutReport(data as unknown as ScoutReport);
                            setLoading(false);
                          }}
                          className="w-full text-left p-3 rounded-[6px] transition-all duration-200"
                          style={{
                            background: "oklch(0.96 0.008 80)",
                            boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06)",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1.5px oklch(0.68 0.155 52 / 40%)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.06)"; }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: "oklch(0.24 0.012 65)" }}>
                                {report.label || (report.sectors as string[])?.join(", ") || "Untitled Report"}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {(report.sectors as string[])?.slice(0, 4).map((s) => (
                                  <Badge key={s} variant="secondary" style={{ background: "oklch(0.72 0.12 178 / 12%)", color: "oklch(0.72 0.12 178)", borderRadius: "4px", fontSize: "10px" }}>
                                    {s}
                                  </Badge>
                                ))}
                                {(report.sectors as string[])?.length > 4 && (
                                  <span className="text-xs" style={{ color: "oklch(0.55 0.02 65)" }}>+{(report.sectors as string[]).length - 4}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs shrink-0 ml-2" style={{ color: "oklch(0.55 0.02 65)" }}>
                              {new Date(report.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                ) : (
                  <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                    <CardContent className="flex flex-col items-center py-12">
                      <Image
                        src="/images/empty-state.webp"
                        alt="No scout reports yet"
                        width={200}
                        height={200}
                        className="mb-4 opacity-70"
                      />
                      <div className="text-sm text-center mb-3" style={{ color: "oklch(0.45 0.02 65)" }}>
                        No Scout reports yet. Run a Scout scan first to generate market context.
                      </div>
                      <Link href="/scout" className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Start a Scout Report
                      </Link>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="manual" className="mt-4">
                <Card style={{
                  boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 0 20px rgba(212, 116, 60, 0.05)",
                  borderRadius: "8px",
                  border: "none",
                }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                      Tell Us About Your Direction
                    </CardTitle>
                    <div className="text-sm mt-1" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                      The more detail you provide, the sharper the ideas. Fields marked * are required.
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Q1: Market */}
                    <GuidedField
                      id="market"
                      label="What market or industry are you targeting? *"
                      placeholder="e.g., B2B SaaS for engineering teams, AI developer tools, e-commerce logistics..."
                      value={guidedInputs.market}
                      onChange={(v) => setGuidedInputs(prev => ({ ...prev, market: v }))}
                      hint="Be specific: 'AI dev tools for solo founders' is better than 'technology'"
                    />

                    {/* Q2: Target audience */}
                    <GuidedField
                      id="audience"
                      label="Who is the target user?"
                      placeholder="e.g., Solo founders building AI products, DevOps engineers at 50-200 person startups..."
                      value={guidedInputs.audience}
                      onChange={(v) => setGuidedInputs(prev => ({ ...prev, audience: v }))}
                      hint="Think about their role, company size, and daily frustrations"
                    />

                    {/* Q3: Pain points */}
                    <GuidedField
                      id="painPoints"
                      label="What pain points or problems have you observed? *"
                      placeholder="e.g., Teams waste 30% of time on boilerplate infra setup. No good way to monitor LLM costs across multiple providers..."
                      value={guidedInputs.painPoints}
                      onChange={(v) => setGuidedInputs(prev => ({ ...prev, painPoints: v }))}
                      hint="Real complaints you've seen on Reddit, HN, or from your own experience"
                      rows={3}
                    />

                    {/* Q4: Constraints */}
                    <GuidedField
                      id="constraints"
                      label="Any constraints or preferences?"
                      placeholder="e.g., Must be bootstrappable, no hardware dependency, prefer API-first, open-source friendly..."
                      value={guidedInputs.constraints}
                      onChange={(v) => setGuidedInputs(prev => ({ ...prev, constraints: v }))}
                      hint="Budget limits, tech stack, business model preferences, things to avoid"
                    />

                    {/* Q5: Extra */}
                    <GuidedField
                      id="extra"
                      label="Anything else the AI should know?"
                      placeholder="e.g., I have domain expertise in fintech compliance. Looking for ideas that leverage existing APIs..."
                      value={guidedInputs.extra}
                      onChange={(v) => setGuidedInputs(prev => ({ ...prev, extra: v }))}
                      hint="Your unfair advantages, trends you've spotted, or specific angles to explore"
                    />

                    {!hasGuidedContent && (
                      <div className="text-xs px-3 py-2 rounded-[6px]" style={{
                        background: "oklch(0.84 0.145 85 / 8%)",
                        color: "oklch(0.60 0.08 52)",
                      }}>
                        Fill in at least the market and pain points to get started.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </BlurFade>

          {/* SESSION_CONFIG — Project Context (collapsible) */}
          <BlurFade delay={0.14}>
            <Card className="mb-6" style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
              <CardHeader className="pb-3">
                <button
                  type="button"
                  onClick={() => setShowContext(v => !v)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div>
                    <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                      Your Project Context
                      <span className="ml-2 text-xs font-normal" style={{ color: "oklch(0.48 0.02 65)" }}>(optional — improves Analyst accuracy)</span>
                    </CardTitle>
                    <div className="text-sm mt-0.5" style={{ color: "oklch(0.45 0.02 65)" }}>
                      Tell Forge your real budget, team, and revenue target. Without this, agents assume $10K / 4-5 team / $100K target.
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
                    transform: showContext ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s", flexShrink: 0, marginLeft: "0.75rem",
                  }}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </CardHeader>
              {showContext && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium" style={{ color: "oklch(0.35 0.015 65)" }}>Team Profile</Label>
                      <Select value={profile} onValueChange={(v) => v && setProfile(v)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Solo">Solo founder</SelectItem>
                          <SelectItem value="Small Team (2-3)">Small team (2-3 people)</SelectItem>
                          <SelectItem value="Small Team (4-5)">Small team (4-5 people)</SelectItem>
                          <SelectItem value="Funded Team (6-15)">Funded team (6-15)</SelectItem>
                          <SelectItem value="Enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium" style={{ color: "oklch(0.35 0.015 65)" }}>MVP Budget</Label>
                      <Select value={budget} onValueChange={(v) => v && setBudget(v)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="$1K">$1K (shoestring)</SelectItem>
                          <SelectItem value="$5K">$5K</SelectItem>
                          <SelectItem value="$10K">$10K (standard lean)</SelectItem>
                          <SelectItem value="$25K">$25K</SelectItem>
                          <SelectItem value="$50K">$50K</SelectItem>
                          <SelectItem value="$100K+">$100K+ (funded)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium" style={{ color: "oklch(0.35 0.015 65)" }}>Validation Timeline</Label>
                      <Select value={timeline} onValueChange={(v) => v && setTimeline(v)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2 weeks">2 weeks (weekend sprint)</SelectItem>
                          <SelectItem value="4 weeks">4 weeks</SelectItem>
                          <SelectItem value="4-8 weeks">4-8 weeks (standard)</SelectItem>
                          <SelectItem value="8-12 weeks">8-12 weeks</SelectItem>
                          <SelectItem value="3-6 months">3-6 months</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium" style={{ color: "oklch(0.35 0.015 65)" }}>Year-1 Revenue Target</Label>
                      <Select value={revenueThreshold} onValueChange={(v) => v && setRevenueThreshold(v)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="$10K/year">$10K/year (side project)</SelectItem>
                          <SelectItem value="$50K/year">$50K/year</SelectItem>
                          <SelectItem value="$100K/year">$100K/year (replace job)</SelectItem>
                          <SelectItem value="$500K/year">$500K/year</SelectItem>
                          <SelectItem value="$1M+/year">$1M+/year (VC-scale)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium" style={{ color: "oklch(0.35 0.015 65)" }}>
                      Founder Background / Unfair Advantages (optional)
                    </Label>
                    <textarea
                      value={founderSignal}
                      onChange={(e) => setFounderSignal(e.target.value)}
                      placeholder="e.g., 10 years in payments infra. Ex-Stripe. Deep network in YC W24 batch."
                      rows={3}
                      className="w-full text-sm rounded-[6px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[oklch(0.84_0.145_85/50%)]"
                      style={{ background: "oklch(0.96 0.008 80)", color: "oklch(0.24 0.012 65)", boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06)", lineHeight: "1.55" }}
                    />
                    <div className="text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>
                      Helps Defender / Analyst weigh execution feasibility (distribution, domain depth, network).
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </BlurFade>

          {/* Model & Cost Estimate */}
          <BlurFade delay={0.16}>
            <div className="mb-6">
              <h2 className="mb-4 font-bold text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                Model & Cost Estimate
              </h2>
              <Card style={{
                boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)",
                borderRadius: "8px",
                border: "none",
              }}>
                <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
                  {/* Model select */}
                  <div className="flex-1 space-y-2">
                    <Label className="text-sm font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>
                      LLM Model
                    </Label>
                    <Select value={selectedModel} onValueChange={(v) => v && setSelectedModel(v)}>
                      <SelectTrigger className="w-full text-base sm:w-72">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(MODEL_COSTS).map(([key, model]) => (
                          <SelectItem key={key} value={key}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Cost estimate */}
                  <div className="flex flex-col items-end gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>Estimated API cost</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            Based on ~${MODEL_COSTS[selectedModel]?.costPerRound.toFixed(2)} per round.
                            {TOTAL_ROUNDS} rounds + 1 strategist pass. Actual cost depends on content.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold" style={{
                        fontFamily: "var(--font-heading)",
                        letterSpacing: "-1.5px",
                        color: "oklch(0.62 0.155 52)",
                      }}>
                        ${estimatedCost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </BlurFade>

          {/* Length-limit warnings — prevent click → 400 → silent revert.
              Shown only on the manual tab (scout-derived context is bounded
              by Scout's own report sizing, not user input). */}
          {sourceTab === "manual" && (contextTooLong || sessionConfigTooLongForge) && (
            <div className="mt-4 mx-auto max-w-md text-xs px-3 py-2 rounded-[6px] flex flex-col gap-1.5" style={{
              background: "oklch(0.55 0.2 25 / 8%)",
              color: "oklch(0.45 0.18 25)",
              border: "1px solid oklch(0.55 0.2 25 / 25%)",
            }}>
              {contextTooLong && (
                <div className="flex items-start gap-2">
                  <span aria-hidden="true">⚠️</span>
                  <span>
                    Project context is <strong>{(manualContextLength - CONTEXT_MAX_LENGTH).toLocaleString()} chars</strong> over the {CONTEXT_MAX_LENGTH.toLocaleString()}-char limit. Trim Pain Points / Additional Context.
                  </span>
                </div>
              )}
              {sessionConfigTooLongForge && (
                <div className="flex items-start gap-2">
                  <span aria-hidden="true">⚠️</span>
                  <span>
                    Project Context (Profile/Budget/Founder Signal) is <strong>{(sessionConfigLength - SESSION_CONFIG_MAX_LENGTH).toLocaleString()} chars</strong> over the {SESSION_CONFIG_MAX_LENGTH.toLocaleString()}-char limit. Trim Founder Signal.
                  </span>
                </div>
              )}
            </div>
          )}
          {sourceTab === "manual" && !contextTooLong && manualContextLength > CONTEXT_MAX_LENGTH * 0.85 && (
            <div className="mt-4 mx-auto max-w-md text-xs text-center" style={{ color: "oklch(0.55 0.02 65)" }}>
              {manualContextLength.toLocaleString()} / {CONTEXT_MAX_LENGTH.toLocaleString()} characters
            </div>
          )}

          {/* Start Button — no BlurFade wrapper to avoid click interception */}
          <div className="mt-6 flex justify-center">
            <Button
              onClick={handleStart}
              disabled={!canStart || isRunning}
              size="lg"
              className="px-10 py-3 text-base font-semibold transition-all duration-300 disabled:opacity-40"
              style={{
                borderRadius: "9999px",
                background: canStart ? "oklch(0.62 0.155 52)" : "oklch(0.90 0.010 75)",
                color: canStart ? "oklch(0.99 0.005 85)" : "oklch(0.60 0.02 65)",
                boxShadow: canStart ? "0 4px 16px rgba(212, 116, 60, 0.30), 0 0 30px rgba(212, 116, 60, 0.12)" : "none",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mr-2">
                <path d="M9 1.5L11.25 6.75L16.5 9L11.25 11.25L9 16.5L6.75 11.25L1.5 9L6.75 6.75L9 1.5Z" fill="currentColor" />
              </svg>
              Start Forging Ideas
            </Button>
          </div>

          {/* Past Forge Sessions */}
          <BlurFade delay={0.22}>
            <div className="mt-12">
              <h2 className="mb-4 font-bold text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                Your Past Sessions
              </h2>
              {loadingPastSessions ? (
                <ForgeCardSkeleton />
              ) : pastSessions.length === 0 ? (
                <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                  <CardContent className="py-10 text-center">
                    <div className="text-sm" style={{ color: "oklch(0.48 0.02 65)" }}>
                      No sessions yet. Start your first Forge brainstorm above.
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {pastSessions.map((session) => {
                    const isComplete = session.status === "complete";
                    const isError = session.status === "error";
                    const isRunningSession = session.status === "running" || session.status === "pending";
                    const ideas = (session.top_ideas as Array<{ name: string }>) || [];
                    const date = new Date(session.created_at);
                    const isEditing = editingLabel === session.id;
                    const statusColor = isComplete
                      ? "oklch(0.55 0.16 155)"
                      : isError ? "oklch(0.55 0.2 25)"
                      : "oklch(0.72 0.14 85)";

                    const displayName = session.label
                      || (ideas.length > 0 ? ideas.slice(0, 2).map(i => i.name).join(", ") : null)
                      || (isRunningSession ? "In progress..." : "Forge Session");

                    return (
                      <Card
                        key={session.id}
                        className={`transition-all duration-200 ${(isComplete || isRunningSession) && !isEditing ? "cursor-pointer hover:translate-y-[-1px]" : ""}`}
                        style={{
                          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)",
                          borderRadius: "8px",
                          border: "none",
                        }}
                        onClick={() => {
                          if (isEditing) return;
                          if (isComplete) {
                            router.push(`/forge-report?id=${session.id}`);
                          } else if (isRunningSession) {
                            // Resume watching an in-flight run via the
                            // ?session= effect, which hydrates state and
                            // re-attaches the Realtime observer.
                            router.push(`/forge?session=${session.id}`);
                          }
                        }}
                      >
                        <CardContent className="flex items-center gap-4 p-4">
                          {/* Status dot */}
                          <div className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: statusColor }} />

                          {/* Main info */}
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <form
                                onClick={(e) => e.stopPropagation()}
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  await fetch(`/api/forge/${session.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ label: editLabelValue }),
                                  });
                                  setPastSessions(prev => prev.map(s =>
                                    s.id === session.id ? { ...s, label: editLabelValue } : s
                                  ));
                                  setEditingLabel(null);
                                }}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="text"
                                  value={editLabelValue}
                                  onChange={(e) => setEditLabelValue(e.target.value)}
                                  className="flex-1 text-sm rounded px-2 py-1 focus:outline-none focus:ring-2"
                                  style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.1)", background: "oklch(0.96 0.008 80)" }}
                                  autoFocus
                                  maxLength={100}
                                  onKeyDown={(e) => { if (e.key === "Escape") setEditingLabel(null); }}
                                />
                                <button type="submit" className="text-xs font-medium px-2 py-1 rounded" style={{ color: "oklch(0.55 0.16 155)" }}>Save</button>
                                <button type="button" onClick={() => setEditingLabel(null)} className="text-xs text-muted-foreground px-2 py-1">Cancel</button>
                              </form>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-sm font-medium truncate" style={{ color: "oklch(0.24 0.012 65)" }}>
                                    {displayName}
                                  </span>
                                  {!isComplete && (
                                    <Badge variant="secondary" style={{
                                      background: `${statusColor}15`,
                                      color: statusColor,
                                      borderRadius: "4px",
                                      fontSize: "10px",
                                    }}>
                                      {isRunningSession ? "Click to watch live" : session.status}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>
                                  <span>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                  <span style={{ opacity: 0.3 }}>|</span>
                                  <span>{date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                                  {session.model && (
                                    <>
                                      <span style={{ opacity: 0.3 }}>|</span>
                                      <span>{session.model}</span>
                                    </>
                                  )}
                                  {session.total_cost_usd != null && session.total_cost_usd > 0 && (
                                    <>
                                      <span style={{ opacity: 0.3 }}>|</span>
                                      <span>${session.total_cost_usd.toFixed(2)}</span>
                                    </>
                                  )}
                                  {ideas.length > 0 && (
                                    <>
                                      <span style={{ opacity: 0.3 }}>|</span>
                                      <span>{ideas.length} ideas</span>
                                    </>
                                  )}
                                  {(() => {
                                    const summary = summarizeSessionConfig(parseSessionConfig(session.session_config));
                                    return summary ? (
                                      <>
                                        <span style={{ opacity: 0.3 }}>|</span>
                                        <span title="Project context used to generate these ideas" style={{ color: "oklch(0.55 0.12 178)" }}>
                                          {summary}
                                        </span>
                                      </>
                                    ) : null;
                                  })()}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Action buttons */}
                          {!isEditing && (
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {/* Rename */}
                              <button
                                onClick={() => { setEditingLabel(session.id); setEditLabelValue(session.label || ""); }}
                                className="p-1.5 rounded hover:bg-muted transition-colors"
                                title="Rename"
                              >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M10 2l2 2-7 7H3V9l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground" />
                                </svg>
                              </button>

                              {/* Delete */}
                              {confirmDeleteId === session.id ? (
                                <div className="flex items-center gap-1 pl-1">
                                  <span className="text-[11px] whitespace-nowrap" style={{ color: "oklch(0.55 0.2 25)" }}>Delete?</span>
                                  <button
                                    onClick={async () => {
                                      setDeletingId(session.id);
                                      await fetch(`/api/forge/${session.id}`, { method: "DELETE" });
                                      setPastSessions(prev => prev.filter(s => s.id !== session.id));
                                      setDeletingId(null);
                                      setConfirmDeleteId(null);
                                    }}
                                    disabled={deletingId === session.id}
                                    className="text-[11px] font-medium px-1.5 py-0.5 rounded hover:bg-destructive/10 transition-colors"
                                    style={{ color: "oklch(0.55 0.2 25)" }}
                                  >
                                    {deletingId === session.id ? "..." : "Yes"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="text-[11px] px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted transition-colors"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(session.id)}
                                  className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                                  title="Delete session"
                                >
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M2 4h10M5 4V2.5h4V4M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" stroke="oklch(0.55 0.2 25)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </BlurFade>
        </>
      )}

      {/* Error State — shows whether mid-run or before start */}
      {error && !isRunning && (
        <BlurFade delay={0}>
          <Card style={{
            boxShadow: "0 0 0 1px rgba(220, 38, 38, 0.2), 0 0 20px rgba(220, 38, 38, 0.08)",
            borderRadius: "8px",
            border: "none",
          }}>
            <CardContent className="py-8 text-center">
              <div className="text-sm font-medium mb-2" style={{ color: "oklch(0.55 0.2 25)" }}>
                {formatErrorTitle(error)}
              </div>
              <div className="text-sm mb-4" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                {formatErrorMessage(error)}
              </div>
              {wasQuotaRefunded(error) && (
                <div
                  className="text-xs mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: "oklch(0.95 0.05 145)",
                    color: "oklch(0.40 0.13 145)",
                    border: "1px solid oklch(0.85 0.08 145)",
                  }}
                >
                  ✓ Your Forge run quota was NOT used — retry anytime.
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => { setError(null); setRounds([]); setCurrentRound(0); setProgress(0); }} variant="outline" size="sm" style={{ borderRadius: "9999px" }}>
                  Start Over
                </Button>
                {rounds.length > 0 && sessionId && (
                  <Button onClick={() => { setError(null); }} variant="outline" size="sm" style={{ borderRadius: "9999px" }}>
                    View Partial Results
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {/* Running State: Rounds Display */}
      {(isRunning || (rounds.length > 0 && !error)) && (
        <div className="space-y-6">
          {/* Progress Header */}
          <BlurFade delay={0}>
            <Card style={{
              boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 0 30px rgba(212, 116, 60, 0.08)",
              borderRadius: "8px",
              border: "none",
            }}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium" style={{ color: "oklch(0.62 0.155 52)" }}>
                    {isRunning
                      ? (progressMessage || `Forging Round ${currentRound} of ${TOTAL_ROUNDS}...`)
                      : "Brainstorm Complete"}
                  </div>
                  <div className="flex items-center gap-2">
                    {isRunning && (
                      <button
                        onClick={() => {
                          // Stop tracking — mark as cancelled locally
                          if (channelRef.current) {
                            channelRef.current.unsubscribe();
                            channelRef.current = null;
                          }
                          if (stallCheckRef.current) {
                            clearInterval(stallCheckRef.current);
                          }
                          setIsRunning(false);
                          setProgressMessage("Cancelled by user");
                          const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
                          setLogEntries(prev => [...prev, { time, msg: "Cancelled by user" }]);
                        }}
                        className="text-xs font-medium px-3 py-1 rounded-full transition-all duration-200"
                        style={{
                          color: "oklch(0.55 0.2 25)",
                          boxShadow: "0 0 0 1px oklch(0.55 0.2 25 / 25%)",
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    <Badge variant="secondary" style={{
                      background: isRunning ? "oklch(0.68 0.155 52 / 15%)" : "oklch(0.65 0.16 155 / 15%)",
                      color: isRunning ? "oklch(0.62 0.155 52)" : "oklch(0.65 0.16 155)",
                      borderRadius: "4px",
                    }}>
                      {isRunning ? "In Progress" : "Complete"}
                    </Badge>
                  </div>
                </div>
                <Progress
                  value={progress}
                  className="h-2"
                  style={{
                    borderRadius: "9999px",
                    background: "oklch(0.92 0.010 75)",
                  }}
                />
                <div className="flex justify-between mt-2">
                  {[...Array(TOTAL_ROUNDS)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-all duration-300"
                      style={{
                        background: i < currentRound ? "oklch(0.62 0.155 52 / 20%)" : "oklch(0.92 0.010 75)",
                        color: i < currentRound ? "oklch(0.62 0.155 52)" : "oklch(0.50 0.02 65)",
                        boxShadow: i === currentRound - 1 && isRunning ? "0 0 12px rgba(212, 116, 60, 0.3)" : "none",
                      }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Activity Log */}
          {logEntries.length > 0 && (
            <BlurFade delay={0.05}>
              <Card style={{
                boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)",
                borderRadius: "8px",
                border: "none",
              }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {isRunning && <div className="h-2 w-2 animate-pulse rounded-full" style={{ background: "oklch(0.62 0.155 52)" }} />}
                    <span className="text-xs font-medium" style={{ color: "oklch(0.48 0.02 65)" }}>Activity Log</span>
                  </div>
                  <div
                    ref={logContainerRef}
                    className="max-h-36 space-y-1 overflow-y-auto font-mono text-xs"
                    style={{ color: "oklch(0.48 0.02 65)" }}
                  >
                    {logEntries.map((entry, i) => (
                      <div
                        key={i}
                        className="flex gap-2"
                        style={{ color: i === logEntries.length - 1 ? "oklch(0.24 0.012 65)" : undefined }}
                      >
                        <span className="shrink-0" style={{ opacity: 0.5 }}>{entry.time}</span>
                        <span>{entry.msg}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* "Forge warming up" — shown when running but no rounds yet,
               so the user sees the AI agents getting ready instead of a still page. */}
          {isRunning && rounds.length === 0 && (
            <BlurFade delay={0.08}>
              <Card
                className="relative overflow-hidden"
                style={{
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 0 40px rgba(212, 116, 60, 0.10)",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    "radial-gradient(ellipse 70% 70% at 50% 30%, oklch(0.96 0.025 52), oklch(0.98 0.008 85))",
                }}
              >
                {/* Drifting embers */}
                <div className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden="true">
                  <Meteors number={10} />
                </div>
                <BorderBeam
                  size={220}
                  duration={6}
                  colorFrom="oklch(0.62 0.155 52)"
                  colorTo="oklch(0.78 0.155 75)"
                />

                <CardContent className="relative z-10 flex flex-col items-center gap-7 px-6 py-12 text-center">
                  {/* Orbiting agents around a glowing ember core */}
                  <div className="relative flex h-[200px] w-[200px] items-center justify-center">
                    <div className="absolute inset-0 motion-reduce:hidden">
                      <Ripple
                        mainCircleSize={120}
                        mainCircleOpacity={0.18}
                        numCircles={4}
                        className="[&_div]:!border-[oklch(0.62_0.155_52/0.40)]"
                      />
                    </div>
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full"
                      style={{
                        background:
                          "radial-gradient(circle at 30% 30%, oklch(0.84 0.15 75), oklch(0.62 0.155 52) 60%, oklch(0.45 0.13 35))",
                        boxShadow:
                          "0 0 32px oklch(0.62 0.155 52 / 0.55), 0 0 8px oklch(0.84 0.15 75 / 0.6) inset",
                      }}
                    >
                      <span className="text-3xl" aria-hidden>✦</span>
                    </div>
                    <OrbitingCircles iconSize={28} radius={75} duration={14} className="motion-reduce:!animate-none">
                      <span title="Proposer" className="grid place-items-center text-base">📝</span>
                      <span title="Defender" className="grid place-items-center text-base">🛡️</span>
                      <span title="Trend Scout" className="grid place-items-center text-base">📈</span>
                      <span title="Contrarian" className="grid place-items-center text-base">⚔️</span>
                    </OrbitingCircles>
                    <OrbitingCircles iconSize={24} radius={100} duration={20} reverse className="motion-reduce:!animate-none">
                      <span title="Gap Finder" className="grid place-items-center text-sm">🔍</span>
                      <span title="Benchmark Hunter" className="grid place-items-center text-sm">🎯</span>
                      <span title="Evidence Hunter" className="grid place-items-center text-sm">🧾</span>
                    </OrbitingCircles>
                  </div>

                  {/* Headline + thinking dots */}
                  <div>
                    <div className="inline-flex items-baseline gap-1">
                      <h3 className="font-heading text-2xl font-bold" style={{ color: "oklch(0.24 0.012 65)", letterSpacing: "-1px" }}>
                        Stoking the forge
                      </h3>
                      <span className="ml-1 inline-flex gap-1 motion-reduce:hidden" aria-hidden="true">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: "oklch(0.62 0.155 52)" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: "oklch(0.62 0.155 52)" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "oklch(0.62 0.155 52)" }} />
                      </span>
                    </div>
                    <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "oklch(0.50 0.02 65)", lineHeight: 1.55 }}>
                      Ten agents are warming up. Proposer drafts candidates, Defender plays creative coach, plus Trend Scout, Contrarian, Gap Finder, Benchmark Hunter, and Evidence Hunter inject competitive context.
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-xs" style={{ color: "oklch(0.55 0.02 65)", lineHeight: 1.55 }}>
                      First round typically lands in <strong>1–8 minutes</strong> depending on the model — Gemini and Claude with native web search take longer per step than MiniMax. The full session runs ~20–40 minutes end-to-end.
                    </p>
                  </div>

                  {/* Active agent strip */}
                  <div className="w-full max-w-xl">
                    <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: "oklch(0.62 0.155 52)" }} />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "oklch(0.62 0.155 52)" }} />
                      </span>
                      Active agents
                    </div>
                    <Marquee pauseOnHover className="[--gap:1rem] [--duration:28s]">
                      {[
                        "Proposer · drafting candidate",
                        "Defender · stress-testing claims",
                        "Trend Scout · sweeping signals",
                        "Contrarian · finding holes",
                        "Gap Finder · mapping whitespace",
                        "Benchmark Hunter · pulling comps",
                        "Evidence Hunter · fact-checking",
                      ].map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                          style={{
                            background: "oklch(1 0.005 85)",
                            boxShadow: "0 1px 6px oklch(0.50 0.02 65 / 0.05), 0 0 0 1px oklch(0.85 0.015 75 / 0.45)",
                            color: "oklch(0.30 0.015 65)",
                          }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "oklch(0.62 0.155 52 / 0.75)" }} />
                          {s}
                        </span>
                      ))}
                    </Marquee>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* Rounds */}
          <div className="space-y-4">
            {rounds.map((round, i) => (
              <RoundCard
                key={round.round}
                data={round}
                index={i}
                isStreaming={isRunning && i === rounds.length - 1}
              />
            ))}
            <div ref={roundsEndRef} />
          </div>

          {/* Completion CTA */}
          {!isRunning && rounds.length === TOTAL_ROUNDS && (
            <BlurFade delay={0.1}>
              <Card className="text-center" style={{
                boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 0 40px rgba(212, 116, 60, 0.12)",
                borderRadius: "8px",
                border: "none",
                background: "linear-gradient(135deg, oklch(0.96 0.008 85), oklch(0.94 0.015 52))",
              }}>
                <CardContent className="py-8">
                  <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{
                    background: "oklch(0.68 0.155 52 / 15%)",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M9 12l2 2 4-4" stroke="oklch(0.62 0.155 52)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="9" stroke="oklch(0.62 0.155 52)" strokeWidth="2" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px", color: "oklch(0.24 0.012 65)" }}>
                    Brainstorm Complete
                  </h3>
                  <div className="text-sm mb-6" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                    {TOTAL_ROUNDS} rounds of Proposer + Defender debate finished. View your top ranked ideas.
                  </div>
                  <Link
                    href={`/forge-report?id=${sessionId}`}
                    className={buttonVariants({ size: "lg" })}
                    style={{
                      borderRadius: "9999px",
                      background: "oklch(0.62 0.155 52)",
                      color: "oklch(0.99 0.005 85)",
                      boxShadow: "0 4px 16px rgba(212, 116, 60, 0.30), 0 0 30px rgba(212, 116, 60, 0.12)",
                    }}
                  >
                    View Top 3 Ideas
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ml-2">
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </CardContent>
              </Card>
            </BlurFade>
          )}
        </div>
      )}
    </div>
  );
}

// --- Page wrapper with Suspense ---
export default function ForgePage() {
  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <Suspense fallback={
        <div className="space-y-6">
          <ForgeCardSkeleton />
          <ForgeCardSkeleton />
        </div>
      }>
        <ForgeContent />
      </Suspense>
    </div>
  );
}
