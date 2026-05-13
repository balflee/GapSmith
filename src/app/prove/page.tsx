"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
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
import { trackProveStart } from "@/lib/events";
import { createClient } from "@/lib/supabase";
import { parseSessionConfig, summarizeSessionConfig } from "@/lib/session-config";
import type { RealtimeChannel } from "@supabase/supabase-js";

// --- Agent definitions (real engine agents) ---
const AGENTS = [
  { id: "proposer", name: "Proposer", role: "Presents and defends the idea with market data and evidence", icon: "P", color: "oklch(0.62 0.155 52)" },
  { id: "challenger", name: "Challenger", role: "Stress-tests viability, finds competitors, builds counter-evidence", icon: "C", color: "oklch(0.55 0.2 25)" },
  { id: "analyst", name: "Analyst", role: "Evaluates lean feasibility, MVP costs, and revenue projections", icon: "A", color: "oklch(0.55 0.16 155)" },
  { id: "defender", name: "Defender", role: "Responds to criticisms with evidence and revised plans", icon: "D", color: "oklch(0.50 0.12 178)" },
  { id: "strategist", name: "Strategist", role: "Generates final verification report and execution roadmap", icon: "S", color: "oklch(0.60 0.14 85)" },
] as const;

// --- Phase definitions ---
const PHASES = [
  { id: "A", label: "Proposal" },
  { id: "B", label: "Challenge" },
  { id: "C", label: "Defense" },
  { id: "D", label: "Verdict" },
] as const;

// --- Round data from engine ---
interface RoundData {
  round: number;
  proposer: string;
  challenger: string;
  challenger_score: number;
  analyst: string;
  defender: string;
  cost: number;
}

// --- Model cost estimates (Prove tier — multi-agent debate + screening) ---
// Excludes Sonnet 4.6, Gemini Flash variants, and Grok (all sizes): debate
// quality drops with these models. They remain available on Scout.
// MiniMax remains the balanced default for full Scout/Forge/Prove runs.
const MODEL_COSTS: Record<string, { name: string; costPerRound: number }> = {
  "claude-opus-4-7": { name: "Claude Opus 4.7", costPerRound: 2.00 },
  "claude-opus-4-6": { name: "Claude Opus 4.6", costPerRound: 2.00 },
  "gpt-5.5-pro": { name: "GPT-5.5 Pro", costPerRound: 6.00 },
  "gpt-5.5": { name: "GPT-5.5", costPerRound: 1.10 },
  "gpt-5.4-pro": { name: "GPT-5.4 Pro", costPerRound: 6.00 },
  "gpt-5.4": { name: "GPT-5.4", costPerRound: 0.50 },
  "gpt-5.4-mini": { name: "GPT-5.4 Mini", costPerRound: 0.15 },
  "gpt-5.4-nano": { name: "GPT-5.4 Nano", costPerRound: 0.04 },
  "gemini-3.1-pro-preview": { name: "Gemini 3.1 Pro (preview)", costPerRound: 1.00 },
  "gemini-2.5-pro": { name: "Gemini 2.5 Pro", costPerRound: 0.80 },
  "MiniMax-M1": { name: "MiniMax-M1", costPerRound: 0.18 },
  "MiniMax-M2.5": { name: "MiniMax-M2.5", costPerRound: 0.12 },
  "MiniMax-M2.7": { name: "MiniMax-M2.7", costPerRound: 0.12 },
};

// --- Ember shimmer skeleton ---
function ProveSkeleton() {
  return (
    <div className="rounded-[8px] overflow-hidden relative" style={{
      background: "oklch(0.96 0.008 85)",
      boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)",
    }}>
      <div className="p-6 space-y-4">
        <div className="h-5 w-2/3 rounded-[4px]" style={{ background: "linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.03 85), oklch(0.92 0.010 75))", backgroundSize: "200% 100%", animation: "ember-shimmer 1.8s ease-in-out infinite" }} />
        <div className="h-4 w-full rounded-[4px]" style={{ background: "linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.025 85), oklch(0.92 0.010 75))", backgroundSize: "200% 100%", animation: "ember-shimmer 1.8s ease-in-out infinite 0.1s" }} />
        <div className="h-4 w-4/5 rounded-[4px]" style={{ background: "linear-gradient(90deg, oklch(0.92 0.010 75), oklch(0.90 0.025 85), oklch(0.92 0.010 75))", backgroundSize: "200% 100%", animation: "ember-shimmer 1.8s ease-in-out infinite 0.2s" }} />
      </div>
      <style>{`@keyframes ember-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
}

// --- Markdown renderer for agent outputs ---
function AgentOutput({ content, accentColor }: { content: string; accentColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n").length;
  const isLong = lines > 20;
  return (
    <div className="relative">
      <div className="prose-sm pl-4 overflow-hidden" style={{
        maxHeight: isLong && !expanded ? "280px" : "none",
        color: "oklch(0.35 0.015 65)", lineHeight: "1.6",
      }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          h1: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1" style={{ color: "oklch(0.24 0.012 65)" }}>{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1" style={{ color: "oklch(0.24 0.012 65)" }}>{children}</h4>,
          h3: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1" style={{ color: "oklch(0.30 0.015 65)" }}>{children}</h5>,
          p: ({ children }) => <p className="text-sm mb-2" style={{ lineHeight: "1.6" }}>{children}</p>,
          ul: ({ children }) => <ul className="text-sm mb-2 pl-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="text-sm mb-2 pl-4 list-decimal space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm" style={{ lineHeight: "1.5" }}>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold" style={{ color: "oklch(0.24 0.012 65)" }}>{children}</strong>,
          code: ({ children }) => <code className="text-xs px-1 py-0.5 rounded" style={{ background: "oklch(0.94 0.008 75)", color: "oklch(0.45 0.02 65)" }}>{children}</code>,
        }}>{content}</ReactMarkdown>
      </div>
      {isLong && !expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-16 flex items-end justify-center" style={{ background: "linear-gradient(transparent, oklch(0.99 0.005 85))" }}>
          <button onClick={() => setExpanded(true)} className="text-xs font-medium px-4 py-1 mb-1 rounded-full" style={{ color: accentColor, boxShadow: `0 0 0 1px ${accentColor}33` }}>Show more</button>
        </div>
      )}
      {isLong && expanded && (
        <button onClick={() => setExpanded(false)} className="text-xs font-medium px-4 py-1 mt-1 rounded-full" style={{ color: accentColor, boxShadow: `0 0 0 1px ${accentColor}33` }}>Show less</button>
      )}
    </div>
  );
}

// --- Round card ---
function RoundCard({ data, index, isStreaming }: { data: RoundData; index: number; isStreaming: boolean }) {
  const agents = [
    { key: "proposer", label: "Proposer", content: data.proposer, color: "oklch(0.62 0.155 52)" },
    { key: "challenger", label: "Challenger", content: data.challenger, color: "oklch(0.55 0.2 25)", score: data.challenger_score },
    { key: "analyst", label: "Analyst", content: data.analyst, color: "oklch(0.55 0.16 155)" },
    { key: "defender", label: "Defender", content: data.defender, color: "oklch(0.50 0.12 178)" },
  ];
  return (
    <BlurFade delay={0.08 * index} inView>
      <Card className="relative overflow-hidden transition-all duration-300 hover:translate-y-[-2px]" style={{
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 0 30px rgba(180, 140, 60, 0.05)",
        borderRadius: "8px", border: "none",
      }}>
        {isStreaming && <BorderBeam size={120} duration={3} colorFrom="oklch(0.84 0.145 85)" colorTo="oklch(0.65 0.16 155)" />}
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px", lineHeight: "1.08" }}>
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold" style={{ background: "oklch(0.84 0.145 85 / 15%)", color: "oklch(0.60 0.14 85)" }}>
              {data.round}
            </span>
            Round {data.round}
            {data.challenger_score > 0 && (
              <Badge variant="secondary" style={{
                background: data.challenger_score >= 7 ? "oklch(0.55 0.16 155 / 12%)" : data.challenger_score >= 4 ? "oklch(0.72 0.14 85 / 12%)" : "oklch(0.55 0.2 25 / 12%)",
                color: data.challenger_score >= 7 ? "oklch(0.55 0.16 155)" : data.challenger_score >= 4 ? "oklch(0.60 0.14 85)" : "oklch(0.55 0.2 25)",
                borderRadius: "4px",
              }}>
                Score: {data.challenger_score}/10
              </Badge>
            )}
            {isStreaming && (
              <Badge variant="secondary" className="ml-auto animate-pulse" style={{ background: "oklch(0.84 0.145 85 / 15%)", color: "oklch(0.60 0.14 85)" }}>
                Debating...
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {agents.map((agent) => (
            <div key={agent.key}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: agent.color }} />
                <span className="text-sm font-medium" style={{ color: agent.color }}>{agent.label}</span>
                {"score" in agent && agent.score !== undefined && (
                  <span className="text-xs ml-1" style={{ color: "oklch(0.48 0.02 65)" }}>({agent.score}/10)</span>
                )}
              </div>
              {agent.content
                ? <AgentOutput content={agent.content} accentColor={agent.color} />
                : <div className="pl-4 h-12 flex items-center"><div className="animate-pulse text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>Waiting...</div></div>
              }
              {agent.key !== "defender" && <div className="w-full h-px mt-4" style={{ background: "oklch(0.24 0.012 65 / 8%)" }} />}
            </div>
          ))}
        </CardContent>
      </Card>
    </BlurFade>
  );
}

// --- Error formatting ---
//
// The engine writes failure detail into prove_sessions.progress_message.
// On a classified-upstream failure that triggered a quota refund, the
// engine appends `[quota_refunded]` (see engine/api.py
// QUOTA_REFUNDED_MARKER). We strip it here and surface it as a separate
// green sub-line in the error card.
const QUOTA_REFUNDED_MARKER = "[quota_refunded]";

function wasQuotaRefunded(error: string): boolean {
  return error.includes(QUOTA_REFUNDED_MARKER);
}

function stripQuotaMarker(error: string): string {
  return error.replace(QUOTA_REFUNDED_MARKER, "").trim();
}

function formatErrorTitle(error: string): string {
  const lower = stripQuotaMarker(error).toLowerCase();
  if (lower.includes("overload") || lower.includes("529")) return "AI Model Temporarily Overloaded";
  if (lower.includes("503") || lower.includes("service unavailable") || lower.includes("unavailable")) return "AI Provider Temporarily Down";
  if (lower.includes("rate") || lower.includes("429") || lower.includes("too many requests")) return "Rate Limit Reached";
  if (lower.includes("timeout") || lower.includes("timed out")) return "Request Timed Out";
  if (lower.includes("connection") || lower.includes("network")) return "Network Connection Issue";
  if (lower.includes("api key") || lower.includes("401")) return "API Key Issue";
  return "Something Went Wrong";
}
function formatErrorMessage(error: string): string {
  const cleaned = stripQuotaMarker(error);
  const lower = cleaned.toLowerCase();
  if (lower.includes("overload") || lower.includes("529")) return "The AI model provider is experiencing high traffic. Please wait a few minutes and try again.";
  if (lower.includes("503") || lower.includes("service unavailable") || lower.includes("unavailable")) return "The AI model provider's API is currently unavailable. This is on their end, not yours — try again in a few minutes, or switch to a different model in Settings.";
  if (lower.includes("rate") || lower.includes("429") || lower.includes("too many requests")) return "You've hit the API rate limit. Please wait or switch to a different model.";
  if (lower.includes("timeout") || lower.includes("timed out")) return "The request took too long. Try again or simplify your input.";
  if (lower.includes("connection") || lower.includes("network")) return "Could not reach the AI provider. Check your internet connection or try again in a moment.";
  if (lower.includes("api key") || lower.includes("401")) return "Your API key may be invalid or expired. Check your Settings page.";
  return cleaned.replace(/^Error:\s*/i, "").substring(0, 200) || "An unexpected error occurred. Please try again.";
}

// --- Main ---
function ProveContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const fromForge = searchParams.get("idea");
  const [ideaSource, setIdeaSource] = useState<string>(fromForge ? "manual" : "forge");
  const [manualIdea, setManualIdea] = useState(fromForge || "");
  const [forgeIdeas, setForgeIdeas] = useState<Array<{
    id: string; name: string; description: string; kill_score: number;
    forge_session_id: string;
    forge_session_config: string;  // raw SESSION_CONFIG.md from the parent forge session, "" if none
  }>>([]);
  const [selectedForgeIdea, setSelectedForgeIdea] = useState<string | null>(null);
  // When a Forge idea is selected, default to inheriting its SESSION_CONFIG.
  // User can flip this to true to override with the manual form below.
  const [overrideForgeContext, setOverrideForgeContext] = useState(false);
  const [loadingForge, setLoadingForge] = useState(true);
  const [selectedModel, setSelectedModel] = useState("gpt-5.4");
  // Project Context (feeds Analyst's lean feasibility math). Default open so
  // users don't forget to fill it — agents otherwise fall back to generic
  // Small Team / $10K / $100K assumptions. Hidden entirely when a Forge idea
  // is selected because that path inherits SESSION_CONFIG from Forge instead.
  const [showContext, setShowContext] = useState(true);
  const [profile, setProfile] = useState<string>("Small Team (4-5)");
  const [budget, setBudget] = useState<string>("$10K");
  const [timeline, setTimeline] = useState<string>("4-8 weeks");
  const [revenueThreshold, setRevenueThreshold] = useState<string>("$100K/year");
  const [sectors, setSectors] = useState<string>("");
  const [founderSignal, setFounderSignal] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<{ time: string; msg: string }[]>([]);
  const [pastSessions, setPastSessions] = useState<Array<{
    id: string; status: string; created_at: string; model: string | null;
    total_cost_usd: number | null; idea: string; verdict: string | null; label: string;
    has_pivot: boolean;
  }>>([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const roundsEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stallCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Active session id ref — used by the URL-resume effect to skip
  // re-attaching to a session we're already watching.
  const activeProveIdRef = useRef<string | null>(null);
  const MAX_ROUNDS = 3;  // matches engine/core/debate_runner.py MAX_ROUNDS

  // Load forge ideas for picker
  useEffect(() => {
    async function loadForgeIdeas() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingForge(false); return; }
      const { data } = await supabase
        .from("forge_sessions")
        .select("id, top_ideas, session_config")
        .eq("user_id", user.id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) {
        const mapped = data.flatMap((s: { id: string; top_ideas: unknown; session_config?: string | null }) => {
          const ideas = (s.top_ideas as Array<{ name?: string; description?: string; kill_score?: number }>) || [];
          const cfg = s.session_config ?? "";
          return ideas.map((idea, i) => ({
            id: `${s.id}-${i}`,
            name: idea.name || "Untitled Idea",
            description: idea.description || "",
            kill_score: idea.kill_score || 0,
            forge_session_id: s.id,
            forge_session_config: cfg,
          }));
        });
        setForgeIdeas(mapped);
      }
      setLoadingForge(false);
    }
    loadForgeIdeas();
    // eslint-disable-next-line
  }, []);

  // Load past prove sessions
  useEffect(() => {
    async function loadPast() {
      setLoadingPast(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingPast(false); return; }
      const { data } = await supabase
        .from("prove_sessions")
        .select("id, status, created_at, model, total_cost_usd, idea, verdict, label, report")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) {
        // Engine writes verdict=REJECTED on the pivot path, but a non-empty
        // pivot_report means the panel actually voted to pivot, not reject.
        // Surface that here so the badge matches the prove-report page.
        const enriched = (data as Array<Record<string, unknown>>).map((s) => {
          const r = s.report as { pivot_report?: string } | null;
          return { ...s, has_pivot: !!r?.pivot_report?.trim() };
        });
        setPastSessions(enriched as typeof pastSessions);
      }
      setLoadingPast(false);
    }
    loadPast();
    // eslint-disable-next-line
  }, []);

  // Auto-scroll
  useEffect(() => {
    // Only scroll when the new round is below the fold; never on round 1.
    if (rounds.length === 0) return;
    const el = roundsEndRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [rounds]);
  useEffect(() => {
    // Tail the inner log container only — never the page.
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logEntries]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }
      if (stallCheckRef.current) clearInterval(stallCheckRef.current);
    };
  }, []);

  const estimatedCost = (MODEL_COSTS[selectedModel]?.costPerRound ?? 0.20) * (MAX_ROUNDS * 4 + 2); // rounds*agents + voting + strategist

  // The Forge idea (if any) the user picked, with the SESSION_CONFIG it was generated under.
  const selectedForgeIdeaRecord = ideaSource === "forge" && selectedForgeIdea
    ? forgeIdeas.find((i) => i.id === selectedForgeIdea)
    : null;
  const inheritedConfig = selectedForgeIdeaRecord?.forge_session_config?.trim() || "";
  const useInheritedContext = !!inheritedConfig && !overrideForgeContext;

  // Build SESSION_CONFIG.md markdown — prefer the inherited Forge config unless
  // the user explicitly overrode it. Falls back to the manual form otherwise.
  const buildSessionConfig = () => {
    if (useInheritedContext) return inheritedConfig;
    const hasAny =
      profile !== "Small Team (4-5)" ||
      budget !== "$10K" ||
      timeline !== "4-8 weeks" ||
      revenueThreshold !== "$100K/year" ||
      sectors.trim() !== "" ||
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
    if (sectors.trim()) {
      lines.push("", "## Sector Focus", `Sectors: ${sectors.trim()}`);
    }
    if (founderSignal.trim()) {
      lines.push("", "## Founder Signal", `Signal: ${founderSignal.trim()}`);
    }
    return lines.join("\n");
  };

  // Backend zod limits — keep in sync with src/app/api/prove/start/route.ts
  // (startProveSchema). Enforcing client-side stops users from clicking
  // Start, watching the page revert to idle, and not understanding why —
  // the backend would 400 on Zod validation, frontend would just throw.
  const IDEA_MAX_LENGTH = 10000;
  const SESSION_CONFIG_MAX_LENGTH = 5000;

  const getIdeaText = () => {
    if (ideaSource === "forge" && selectedForgeIdea) {
      const idea = forgeIdeas.find(i => i.id === selectedForgeIdea);
      return idea ? `${idea.name}: ${idea.description}` : "";
    }
    return manualIdea;
  };

  const ideaLength = getIdeaText().length;
  const sessionConfigLength = buildSessionConfig().length;
  const ideaTooLong = ideaLength > IDEA_MAX_LENGTH;
  const sessionConfigTooLong = sessionConfigLength > SESSION_CONFIG_MAX_LENGTH;

  const canStart =
    !ideaTooLong &&
    !sessionConfigTooLong &&
    (ideaSource === "forge"
      ? !!selectedForgeIdea
      : manualIdea.trim().length > 10);

  const handleStart = async () => {
    if (!canStart || isRunning) return;
    // Snap to top so the user sees the running-state header and the
    // 'Convening the debate' card instead of staying mid-page.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    const idea = getIdeaText();
    if (!idea.trim()) return;

    setIsRunning(true);
    setRounds([]);
    setProgress(0);
    setProgressMessage("");
    setError(null);
    setLogEntries([]);

    trackProveStart({ source: ideaSource === "forge" ? "from_forge" : "manual" });

    try {
      const response = await fetch("/api/prove/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea,
          model: selectedModel,
          session_config: buildSessionConfig(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 402 && errorData.reason === "quota_exhausted") {
          alert(
            `You've used all ${errorData.total} included Prove debates this year.\n\n` +
            `For more Prove debates, order our premium Done-For-You service ($149, ` +
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
        throw new Error(errorData.error || "Failed to start prove session");
      }

      const { id: proveId } = await response.json();
      setSessionId(proveId);

      // Push id into URL so refresh / tab-restore / "Past Sessions" click
      // resumes the same in-flight run instead of losing the reference.
      router.replace(`/prove?session=${proveId}`, { scroll: false });

      watchProveSession(proveId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start prove session");
      setIsRunning(false);
    }
  };

  // Subscribe to a Prove session: Realtime UPDATE + 10s polling fallback +
  // heartbeat log lines for long silent phases. Extracted from inline
  // handleStart so URL-resume + Past Sessions click reuse the same observer.
  // Idempotent: re-attaching to a different id tears down the previous one.
  function watchProveSession(proveId: string) {
    channelRef.current?.unsubscribe();
    if (stallCheckRef.current) clearInterval(stallCheckRef.current);
    activeProveIdRef.current = proveId;

    let lastProgressTime = Date.now();
    let lastHeartbeatShown = Date.now();
    let currentPhaseLabel = "";

    const channel = supabase
      .channel(`prove-progress-${proveId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "prove_sessions",
        filter: `id=eq.${proveId}`,
      }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as {
          progress: number; progress_message: string; status: string;
          rounds: RoundData[] | null;
        };
        setProgress(row.progress);
        setProgressMessage(row.progress_message);
        if (row.progress_message) {
          lastProgressTime = Date.now();
          lastHeartbeatShown = Date.now();
          currentPhaseLabel = row.progress_message;
          const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setLogEntries(prev => {
            if (prev.length > 0 && prev[prev.length - 1].msg === row.progress_message) return prev;
            return [...prev, { time, msg: row.progress_message }];
          });
        }
        if (row.rounds && row.rounds.length > 0) setRounds(row.rounds);
        if (row.status === "complete") {
          setProgress(100);
          setIsRunning(false);
          setTimeout(() => router.push(`/prove-report?id=${proveId}`), 1500);
          channel.unsubscribe();
          channelRef.current = null;
        } else if (row.status === "error") {
          setError(row.progress_message || "The session encountered an error.");
          setIsRunning(false);
          channel.unsubscribe();
          channelRef.current = null;
        }
      }).subscribe();

    channelRef.current = channel;

    stallCheckRef.current = setInterval(async () => {
      if (!channelRef.current) { clearInterval(stallCheckRef.current!); return; }

      const sinceProgress = Date.now() - lastProgressTime;
      const sinceHeartbeat = Date.now() - lastHeartbeatShown;
      if (sinceProgress > 90_000 && sinceHeartbeat > 60_000 && currentPhaseLabel) {
        const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const elapsedMin = Math.max(1, Math.round(sinceProgress / 60_000));
        const heartbeatMsg = `Still working on "${currentPhaseLabel}" — ${elapsedMin}m+ in. Native-search models (Gemini, Claude) often take 5–10 min per phase.`;
        setLogEntries(prev => [...prev, { time, msg: heartbeatMsg }]);
        lastHeartbeatShown = Date.now();
      }

      try {
        const check = await fetch(`/api/prove/${proveId}`);
        if (!check.ok) return;
        const data = await check.json();
        if (data.progress !== undefined) setProgress(data.progress);
        if (data.progress_message) {
          setProgressMessage(data.progress_message);
          const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setLogEntries(prev => {
            if (prev.length > 0 && prev[prev.length - 1].msg === data.progress_message) return prev;
            return [...prev, { time, msg: data.progress_message }];
          });
          lastProgressTime = Date.now();
          lastHeartbeatShown = Date.now();
          currentPhaseLabel = data.progress_message;
        }
        if (data.rounds && Array.isArray(data.rounds) && data.rounds.length > 0) setRounds(data.rounds);
        if (data.status === "error") {
          setError(data.progress_message || "Error");
          setIsRunning(false);
          channel.unsubscribe(); channelRef.current = null;
          clearInterval(stallCheckRef.current!);
        } else if (data.status === "complete") {
          setProgress(100);
          setIsRunning(false);
          if (data.rounds) setRounds(data.rounds);
          setTimeout(() => router.push(`/prove-report?id=${proveId}`), 1500);
          channel.unsubscribe(); channelRef.current = null;
          clearInterval(stallCheckRef.current!);
        }
      } catch { /* ignore poll errors */ }
    }, 10_000);
  }

  // --- Resume from URL ---
  // ?session=<id> resumes an in-flight run after a refresh, tab-restore,
  // or "Past Sessions" click. ?from_forge=<id> is a separate, pre-existing
  // form pre-fill mechanism — both can coexist.
  useEffect(() => {
    const sid = searchParams.get("session");
    if (!sid) return;
    if (activeProveIdRef.current === sid) return;

    let cancelled = false;
    (async () => {
      const { data, error: fetchErr } = await supabase
        .from("prove_sessions")
        .select("id, status, progress, progress_message, rounds")
        .eq("id", sid)
        .maybeSingle();
      if (cancelled || !data || fetchErr) return;

      if (data.status === "complete") {
        router.replace(`/prove-report?id=${sid}`);
        return;
      }
      if (data.status === "error") {
        setError(data.progress_message || "The session ended with an error.");
        setIsRunning(false);
        activeProveIdRef.current = sid;
        return;
      }

      setSessionId(sid);
      setIsRunning(true);
      setProgress(data.progress ?? 0);
      setProgressMessage(data.progress_message ?? "");
      if (data.rounds && Array.isArray(data.rounds)) {
        setRounds(data.rounds as RoundData[]);
      }
      watchProveSession(sid);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="min-w-0 w-full overflow-x-hidden">
      {/* Header */}
      <BlurFade delay={0}>
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "oklch(0.84 0.145 85 / 15%)" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 1L13 7L19 8L14.5 12.5L15.5 19L10 16L4.5 19L5.5 12.5L1 8L7 7L10 1Z" fill="oklch(0.60 0.14 85)" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-2px", lineHeight: "1.08", color: "oklch(0.24 0.012 65)" }}>
                Prove
              </h1>
              <div className="text-sm" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                10 AI agents (5 main + 5 sub) debate your idea across multiple rounds — get a verdict backed by rigorous analysis
              </div>
            </div>
          </div>
        </div>
      </BlurFade>

      {!isRunning && rounds.length === 0 && (
        <>
          {/* Idea Source Tabs */}
          <BlurFade delay={0.06}>
            <Tabs value={ideaSource} onValueChange={setIdeaSource} className="mb-6">
              <TabsList className="grid w-full grid-cols-2" style={{ background: "oklch(0.93 0.012 75)", borderRadius: "8px" }}>
                <TabsTrigger value="forge" style={{ borderRadius: "6px" }}>From Forge Ideas</TabsTrigger>
                <TabsTrigger value="manual" style={{ borderRadius: "6px" }}>Enter Manually</TabsTrigger>
              </TabsList>

              <TabsContent value="forge" className="mt-4">
                {loadingForge ? <ProveSkeleton /> : forgeIdeas.length === 0 ? (
                  <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                    <CardContent className="flex flex-col items-center py-12">
                      <Image src="/images/empty-state.webp" alt="No forge ideas" width={200} height={200} className="mb-4 opacity-70" />
                      <div className="text-sm text-center mb-3" style={{ color: "oklch(0.45 0.02 65)" }}>
                        No Forge ideas yet. Run a Forge session first, or enter your idea manually.
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setIdeaSource("manual")}>Enter manually</Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {forgeIdeas.map((idea) => (
                      <button key={idea.id} type="button"
                        onClick={() => setSelectedForgeIdea(idea.id)}
                        className="w-full text-left p-3 rounded-[6px] transition-all duration-200"
                        style={{
                          background: selectedForgeIdea === idea.id ? "oklch(0.84 0.145 85 / 6%)" : "oklch(0.96 0.008 80)",
                          boxShadow: selectedForgeIdea === idea.id
                            ? "0 0 0 2px oklch(0.84 0.145 85 / 50%)"
                            : "0 0 0 1px rgba(0, 0, 0, 0.06)",
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium" style={{ color: "oklch(0.24 0.012 65)" }}>{idea.name}</div>
                            <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "oklch(0.45 0.02 65)" }}>{idea.description}</div>
                          </div>
                          <Badge variant="secondary" className="ml-2 shrink-0" style={{
                            background: idea.kill_score >= 7 ? "oklch(0.55 0.16 155 / 12%)" : "oklch(0.72 0.14 85 / 12%)",
                            color: idea.kill_score >= 7 ? "oklch(0.55 0.16 155)" : "oklch(0.60 0.14 85)",
                            borderRadius: "4px",
                          }}>{idea.kill_score}/10</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="manual" className="mt-4">
                <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                      Describe Your Idea
                    </CardTitle>
                    <div className="text-sm mt-1" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                      Include target market, problem, solution, and business model for the best debate quality.
                    </div>
                  </CardHeader>
                  <CardContent>
                    <textarea
                      value={manualIdea}
                      onChange={(e) => setManualIdea(e.target.value)}
                      placeholder="e.g., An AI-powered code review platform that uses multi-agent debate to provide thorough, transparent reviews for engineering teams..."
                      rows={5}
                      className="w-full text-sm rounded-[6px] px-4 py-2.5 resize-y transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[oklch(0.84_0.145_85/50%)]"
                      style={{ background: "oklch(0.96 0.008 80)", color: "oklch(0.24 0.012 65)", boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06)", lineHeight: "1.55" }}
                    />
                    <div className="flex items-center justify-between mt-1.5 text-xs" style={{ color: "oklch(0.55 0.02 65)" }}>
                      <span>
                        {manualIdea.length > 0 && manualIdea.length <= 10
                          ? <span style={{ color: "oklch(0.60 0.08 52)" }}>Add more detail for a meaningful debate.</span>
                          : null}
                      </span>
                      <span style={{
                        color: manualIdea.length > IDEA_MAX_LENGTH ? "oklch(0.55 0.2 25)" : "oklch(0.55 0.02 65)",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {manualIdea.length.toLocaleString()} / {IDEA_MAX_LENGTH.toLocaleString()}
                      </span>
                    </div>
                    {manualIdea.length > IDEA_MAX_LENGTH && (
                      <div className="text-xs mt-2 px-3 py-2 rounded-[6px] flex items-start gap-2" style={{
                        background: "oklch(0.55 0.2 25 / 8%)",
                        color: "oklch(0.45 0.18 25)",
                        border: "1px solid oklch(0.55 0.2 25 / 25%)",
                      }}>
                        <span aria-hidden="true">⚠️</span>
                        <span>
                          Your idea is <strong>{(manualIdea.length - IDEA_MAX_LENGTH).toLocaleString()} characters</strong> over the {IDEA_MAX_LENGTH.toLocaleString()}-char limit. Trim it before submitting, or paste a focused summary instead of the full draft.
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </BlurFade>

          {/* Agent Preview */}
          <BlurFade delay={0.12}>
            <Card className="mb-6" style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>Your Debate Panel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {AGENTS.map((agent) => (
                    <div key={agent.id} className="flex items-start gap-3 rounded-lg p-3" style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.04)" }}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold" style={{ background: `${agent.color}15`, color: agent.color }}>
                        {agent.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium" style={{ color: "oklch(0.24 0.012 65)" }}>{agent.name}</div>
                        <div className="mt-0.5 text-xs leading-relaxed" style={{ color: "oklch(0.48 0.02 65)" }}>{agent.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Inherited-from-Forge context banner — shown when a Forge idea is selected
              and the user hasn't asked to override. Replaces the manual form. */}
          {useInheritedContext && (
            <BlurFade delay={0.14}>
              <Card className="mb-6" style={{ boxShadow: "0 0 0 1px oklch(0.55 0.12 178 / 25%)", borderRadius: "8px", border: "none", background: "oklch(0.55 0.12 178 / 4%)" }}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "oklch(0.45 0.12 178)" }}>
                        Inherited from Forge report
                      </div>
                      <div className="text-sm font-medium" style={{ color: "oklch(0.24 0.012 65)" }}>
                        {summarizeSessionConfig(parseSessionConfig(inheritedConfig)) || "(custom context)"}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "oklch(0.48 0.02 65)" }}>
                        Prove will evaluate this idea against the same constraints Forge used to select it.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOverrideForgeContext(true)}
                      className="text-xs font-medium px-3 py-1.5 rounded-md whitespace-nowrap"
                      style={{ background: "oklch(0.96 0.008 80)", color: "oklch(0.35 0.015 65)", boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}
                    >
                      Override context
                    </button>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* Project Context (optional) — hidden when inheriting from Forge unless user overrides */}
          {!useInheritedContext && (
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
                      <span className="ml-2 text-xs font-normal" style={{ color: "oklch(0.48 0.02 65)" }}>
                        {overrideForgeContext ? "(overriding Forge context)" : "(optional — improves Analyst accuracy)"}
                      </span>
                    </CardTitle>
                    <div className="text-sm mt-0.5" style={{ color: "oklch(0.45 0.02 65)" }}>
                      {overrideForgeContext
                        ? "Forge's original context is being overridden. Prove will use what you set below instead."
                        : "Tell the debate your real budget, team, and background. Without this, agents assume $10K / 4-5 team / $100K target."}
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
                    <Label className="text-sm font-medium" style={{ color: "oklch(0.35 0.015 65)" }}>Sector Focus (optional)</Label>
                    <input
                      type="text"
                      value={sectors}
                      onChange={(e) => setSectors(e.target.value)}
                      placeholder="e.g., DevTools, FinTech, HealthTech"
                      className="w-full text-sm rounded-[6px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[oklch(0.84_0.145_85/50%)]"
                      style={{ background: "oklch(0.96 0.008 80)", color: "oklch(0.24 0.012 65)", boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06)" }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium" style={{ color: "oklch(0.35 0.015 65)" }}>
                      Founder Background / Unfair Advantages (optional)
                    </Label>
                    <textarea
                      value={founderSignal}
                      onChange={(e) => setFounderSignal(e.target.value)}
                      placeholder="e.g., 10 years in payments infra. Ex-Stripe. Deep network in YC W24 batch. Built two previous B2B SaaS."
                      rows={3}
                      className="w-full text-sm rounded-[6px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[oklch(0.84_0.145_85/50%)]"
                      style={{ background: "oklch(0.96 0.008 80)", color: "oklch(0.24 0.012 65)", boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.06)", lineHeight: "1.55" }}
                    />
                    <div className="text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>
                      Helps Challenger/Analyst weigh execution feasibility (distribution access, domain depth, network).
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </BlurFade>
          )}

          {/* Model & Cost */}
          <BlurFade delay={0.16}>
            <div className="mb-6">
              <h2 className="mb-4 font-bold text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>Model & Cost Estimate</h2>
              <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-2">
                    <Label className="text-sm font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>LLM Model</Label>
                    <Select value={selectedModel} onValueChange={(v) => v && setSelectedModel(v)}>
                      <SelectTrigger className="w-full text-base sm:w-72"><SelectValue placeholder="Select a model" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(MODEL_COSTS).map(([key, model]) => (
                          <SelectItem key={key} value={key}>{model.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <TooltipProvider><Tooltip><TooltipTrigger>
                      <span className="text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>Estimated API cost</span>
                    </TooltipTrigger><TooltipContent><p className="text-xs">{MAX_ROUNDS} rounds x 4 agents + voting + strategist. Actual cost depends on content.</p></TooltipContent></Tooltip></TooltipProvider>
                    <span className="text-3xl font-bold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1.5px", color: "oklch(0.60 0.14 85)" }}>
                      ${estimatedCost.toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </BlurFade>

          {/* Length-limit warnings — surface session_config over-limit
              so users understand why the Start button is disabled even if
              their idea is fine. The idea over-limit warning is rendered
              inline under the textarea above. */}
          {sessionConfigTooLong && (
            <div className="mt-4 mx-auto max-w-md text-xs px-3 py-2 rounded-[6px] flex items-start gap-2" style={{
              background: "oklch(0.55 0.2 25 / 8%)",
              color: "oklch(0.45 0.18 25)",
              border: "1px solid oklch(0.55 0.2 25 / 25%)",
            }}>
              <span aria-hidden="true">⚠️</span>
              <span>
                Project Context is <strong>{(sessionConfigLength - SESSION_CONFIG_MAX_LENGTH).toLocaleString()} chars</strong> over the {SESSION_CONFIG_MAX_LENGTH.toLocaleString()}-char limit. Trim the Founder Signal field above.
              </span>
            </div>
          )}

          {/* Start Button */}
          <div className="mt-6 flex justify-center">
            <Button onClick={handleStart} disabled={!canStart || isRunning} size="lg"
              className="px-10 py-3 text-base font-semibold transition-all duration-300 disabled:opacity-40"
              style={{
                borderRadius: "9999px",
                background: canStart ? "oklch(0.60 0.14 85)" : "oklch(0.90 0.010 75)",
                color: canStart ? "oklch(0.99 0.005 85)" : "oklch(0.60 0.02 65)",
                boxShadow: canStart ? "0 4px 16px rgba(180, 140, 60, 0.30), 0 0 30px rgba(180, 140, 60, 0.12)" : "none",
              }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mr-2">
                <path d="M9 1L11.5 6.5L17 7.5L13 11.5L14 17L9 14.5L4 17L5 11.5L1 7.5L6.5 6.5L9 1Z" fill="currentColor" />
              </svg>
              Start Prove Debate
            </Button>
          </div>

          {/* Past Sessions */}
          <BlurFade delay={0.22}>
            <div className="mt-12">
              <h2 className="mb-4 font-bold text-lg" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>Your Past Sessions</h2>
              {loadingPast ? <ProveSkeleton /> : pastSessions.length === 0 ? (
                <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                  <CardContent className="py-10 text-center">
                    <div className="text-sm" style={{ color: "oklch(0.48 0.02 65)" }}>No sessions yet. Start your first Prove debate above.</div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {pastSessions.map((session) => {
                    const isComplete = session.status === "complete";
                    const isError = session.status === "error";
                    const isRunningSession = session.status === "running" || session.status === "pending";
                    const isEditing = editingLabel === session.id;
                    const date = new Date(session.created_at);
                    const statusColor = isComplete ? "oklch(0.55 0.16 155)" : isError ? "oklch(0.55 0.2 25)" : "oklch(0.72 0.14 85)";
                    // Engine now emits verdict="PIVOT_OUT" directly. The pivot_report
                    // fallback (has_pivot) keeps old sessions (saved with verdict=REJECTED
                    // alongside a populated pivot_report) badging correctly until they age out.
                    const effectiveVerdict = session.verdict === "PIVOT_OUT" || session.has_pivot
                      ? "PIVOT_OUT"
                      : session.verdict;
                    const verdictColor =
                      effectiveVerdict === "APPROVED" ? "oklch(0.55 0.16 155)" :
                      effectiveVerdict === "REJECTED" ? "oklch(0.55 0.2 25)" :
                      effectiveVerdict === "PIVOT_OUT" ? "oklch(0.50 0.16 60)" :
                      "oklch(0.60 0.14 85)";
                    const verdictLabel =
                      effectiveVerdict === "PIVOT_OUT" ? "PIVOT OUT" :
                      effectiveVerdict ? effectiveVerdict.replace("_", " ") : "";
                    const displayName = session.label || session.idea?.substring(0, 60) || "Prove Session";

                    return (
                      <Card key={session.id}
                        className={`transition-all duration-200 ${(isComplete || isRunningSession) && !isEditing ? "cursor-pointer hover:translate-y-[-1px]" : ""}`}
                        style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}
                        onClick={() => {
                          if (isEditing) return;
                          if (isComplete) {
                            router.push(`/prove-report?id=${session.id}`);
                          } else if (isRunningSession) {
                            // Resume watching an in-flight debate via the
                            // ?session= effect, which hydrates state and
                            // re-attaches the Realtime observer.
                            router.push(`/prove?session=${session.id}`);
                          }
                        }}
                      >
                        <CardContent className="flex items-center gap-4 p-4">
                          <div className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: statusColor }} />
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <form onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
                                e.preventDefault();
                                await fetch(`/api/prove/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: editLabelValue }) });
                                setPastSessions(prev => prev.map(s => s.id === session.id ? { ...s, label: editLabelValue } : s));
                                setEditingLabel(null);
                              }} className="flex items-center gap-2">
                                <input type="text" value={editLabelValue} onChange={(e) => setEditLabelValue(e.target.value)}
                                  className="flex-1 text-sm rounded px-2 py-1 focus:outline-none focus:ring-2"
                                  style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.1)", background: "oklch(0.96 0.008 80)" }}
                                  autoFocus maxLength={100} onKeyDown={(e) => { if (e.key === "Escape") setEditingLabel(null); }} />
                                <button type="submit" className="text-xs font-medium px-2 py-1 rounded" style={{ color: "oklch(0.55 0.16 155)" }}>Save</button>
                                <button type="button" onClick={() => setEditingLabel(null)} className="text-xs text-muted-foreground px-2 py-1">Cancel</button>
                              </form>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-sm font-medium truncate" style={{ color: "oklch(0.24 0.012 65)" }}>{displayName}</span>
                                  {effectiveVerdict && isComplete && (
                                    <Badge variant="secondary" style={{ background: `${verdictColor}12`, color: verdictColor, borderRadius: "4px", fontSize: "10px" }}>
                                      {verdictLabel}
                                    </Badge>
                                  )}
                                  {!isComplete && (
                                    <Badge variant="secondary" style={{ background: `${statusColor}15`, color: statusColor, borderRadius: "4px", fontSize: "10px" }}>
                                      {isRunningSession ? "Click to watch live" : session.status}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>
                                  <span>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                  <span style={{ opacity: 0.3 }}>|</span>
                                  <span>{date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                                  {session.model && <><span style={{ opacity: 0.3 }}>|</span><span>{session.model}</span></>}
                                  {session.total_cost_usd != null && session.total_cost_usd > 0 && <><span style={{ opacity: 0.3 }}>|</span><span>${session.total_cost_usd.toFixed(2)}</span></>}
                                </div>
                              </>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => { setEditingLabel(session.id); setEditLabelValue(session.label || ""); }} className="p-1.5 rounded hover:bg-muted transition-colors" title="Rename">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 2l2 2-7 7H3V9l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground" /></svg>
                              </button>
                              {confirmDeleteId === session.id ? (
                                <div className="flex items-center gap-1 pl-1">
                                  <span className="text-[11px] whitespace-nowrap" style={{ color: "oklch(0.55 0.2 25)" }}>Delete?</span>
                                  <button onClick={async () => { setDeletingId(session.id); await fetch(`/api/prove/${session.id}`, { method: "DELETE" }); setPastSessions(prev => prev.filter(s => s.id !== session.id)); setDeletingId(null); setConfirmDeleteId(null); }}
                                    disabled={deletingId === session.id} className="text-[11px] font-medium px-1.5 py-0.5 rounded hover:bg-destructive/10" style={{ color: "oklch(0.55 0.2 25)" }}>
                                    {deletingId === session.id ? "..." : "Yes"}
                                  </button>
                                  <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted">No</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmDeleteId(session.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors" title="Delete">
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5h4V4M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" stroke="oklch(0.55 0.2 25)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
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

      {/* Error State */}
      {error && !isRunning && (
        <BlurFade delay={0}>
          <Card style={{ boxShadow: "0 0 0 1px rgba(220, 38, 38, 0.2), 0 0 20px rgba(220, 38, 38, 0.08)", borderRadius: "8px", border: "none" }}>
            <CardContent className="py-8 text-center">
              <div className="text-sm font-medium mb-2" style={{ color: "oklch(0.55 0.2 25)" }}>{formatErrorTitle(error)}</div>
              <div className="text-sm mb-4" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>{formatErrorMessage(error)}</div>
              {wasQuotaRefunded(error) && (
                <div
                  className="text-xs mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: "oklch(0.95 0.05 145)",
                    color: "oklch(0.40 0.13 145)",
                    border: "1px solid oklch(0.85 0.08 145)",
                  }}
                >
                  ✓ Your Prove run quota was NOT used — retry anytime.
                </div>
              )}
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => { setError(null); setRounds([]); setProgress(0); }} variant="outline" size="sm" style={{ borderRadius: "9999px" }}>Start Over</Button>
              </div>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {/* Running State */}
      {(isRunning || (rounds.length > 0 && !error)) && (
        <div className="space-y-6">
          {/* Progress */}
          <BlurFade delay={0}>
            <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 0 30px rgba(180, 140, 60, 0.08)", borderRadius: "8px", border: "none" }}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium" style={{ color: "oklch(0.60 0.14 85)" }}>
                    {isRunning ? (progressMessage || "Starting debate...") : "Debate Complete"}
                  </div>
                  <div className="flex items-center gap-2">
                    {isRunning && (
                      <button
                        onClick={() => {
                          // Stop tracking locally — backend task continues but we detach
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
                      background: isRunning ? "oklch(0.84 0.145 85 / 15%)" : "oklch(0.55 0.16 155 / 15%)",
                      color: isRunning ? "oklch(0.60 0.14 85)" : "oklch(0.55 0.16 155)",
                      borderRadius: "4px",
                    }}>{isRunning ? "In Progress" : "Complete"}</Badge>
                  </div>
                </div>
                <Progress value={progress} className="h-2" style={{ borderRadius: "9999px", background: "oklch(0.92 0.010 75)" }} />
                <div className="flex justify-between mt-2">
                  {PHASES.map((phase, i) => {
                    const phasePct = [15, 30, 75, 85];
                    const isActive = progress >= phasePct[i] && progress < (phasePct[i + 1] || 101);
                    const isDone = progress >= (phasePct[i + 1] || 100);
                    return (
                      <div key={phase.id} className="text-xs text-center" style={{
                        color: isDone ? "oklch(0.55 0.16 155)" : isActive ? "oklch(0.60 0.14 85)" : "oklch(0.48 0.02 65)",
                        fontWeight: isActive ? 600 : 400,
                      }}>{phase.label}</div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Activity Log */}
          {logEntries.length > 0 && (
            <BlurFade delay={0.05}>
              <Card style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08)", borderRadius: "8px", border: "none" }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {isRunning && <div className="h-2 w-2 animate-pulse rounded-full" style={{ background: "oklch(0.60 0.14 85)" }} />}
                    <span className="text-xs font-medium" style={{ color: "oklch(0.48 0.02 65)" }}>Activity Log</span>
                  </div>
                  <div
                    ref={logContainerRef}
                    className="max-h-36 space-y-1 overflow-y-auto font-mono text-xs"
                    style={{ color: "oklch(0.48 0.02 65)" }}
                  >
                    {logEntries.map((entry, i) => (
                      <div key={i} className="flex gap-2" style={{ color: i === logEntries.length - 1 ? "oklch(0.24 0.012 65)" : undefined }}>
                        <span className="shrink-0" style={{ opacity: 0.5 }}>{entry.time}</span>
                        <span>{entry.msg}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* "Debate convening" — shown while running with no rounds yet,
               so the user sees the 5 agents preparing instead of a still page. */}
          {isRunning && rounds.length === 0 && (
            <BlurFade delay={0.08}>
              <Card
                className="relative overflow-hidden"
                style={{
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 0 40px rgba(180, 140, 60, 0.10)",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    "radial-gradient(ellipse 70% 70% at 50% 30%, oklch(0.97 0.025 85), oklch(0.98 0.008 85))",
                }}
              >
                <div className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden="true">
                  <Meteors number={10} />
                </div>
                <BorderBeam
                  size={220}
                  duration={6}
                  colorFrom="oklch(0.78 0.155 75)"
                  colorTo="oklch(0.62 0.155 52)"
                />

                <CardContent className="relative z-10 flex flex-col items-center gap-7 px-6 py-12 text-center">
                  {/* Spark verdict-gavel core with orbiting agents */}
                  <div className="relative flex h-[200px] w-[200px] items-center justify-center">
                    <div className="absolute inset-0 motion-reduce:hidden">
                      <Ripple
                        mainCircleSize={120}
                        mainCircleOpacity={0.18}
                        numCircles={4}
                        className="[&_div]:!border-[oklch(0.78_0.155_75/0.45)]"
                      />
                    </div>
                    <div
                      className="relative flex h-20 w-20 items-center justify-center rounded-full"
                      style={{
                        background:
                          "radial-gradient(circle at 30% 30%, oklch(0.92 0.13 85), oklch(0.78 0.155 75) 60%, oklch(0.55 0.13 65))",
                        boxShadow:
                          "0 0 32px oklch(0.78 0.155 75 / 0.55), 0 0 8px oklch(0.92 0.13 85 / 0.6) inset",
                      }}
                    >
                      <span className="text-3xl" aria-hidden>⚖️</span>
                    </div>
                    <OrbitingCircles iconSize={28} radius={80} duration={16} className="motion-reduce:!animate-none">
                      <span title="Proposer" className="grid place-items-center text-base">📜</span>
                      <span title="Challenger" className="grid place-items-center text-base">⚔️</span>
                      <span title="Analyst" className="grid place-items-center text-base">📊</span>
                      <span title="Defender" className="grid place-items-center text-base">🛡️</span>
                      <span title="Strategist" className="grid place-items-center text-base">🧭</span>
                    </OrbitingCircles>
                  </div>

                  {/* Headline + thinking dots */}
                  <div>
                    <div className="inline-flex items-baseline gap-1">
                      <h3
                        className="font-heading text-2xl font-bold"
                        style={{ color: "oklch(0.24 0.012 65)", letterSpacing: "-1px" }}
                      >
                        Convening the debate
                      </h3>
                      <span className="ml-1 inline-flex gap-1 motion-reduce:hidden" aria-hidden="true">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: "oklch(0.78 0.155 75)" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: "oklch(0.78 0.155 75)" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "oklch(0.78 0.155 75)" }} />
                      </span>
                    </div>
                    <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "oklch(0.50 0.02 65)", lineHeight: 1.55 }}>
                      Ten agents are taking their seats. Proposer presents, Challenger attacks viability, Analyst pressure-tests unit economics, Defender steelmans, Reviewer fact-checks every claim — plus five sub-agents (Trend Scout, Contrarian, Gap Finder, Benchmark Hunter, Evidence Hunter) inject competitive context.
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-xs" style={{ color: "oklch(0.55 0.02 65)", lineHeight: 1.55 }}>
                      Round 1 opens in <strong>2–10 minutes</strong> depending on the model — Gemini and Claude with native web search take longer per phase than MiniMax. Full debate runs ~20–60 minutes end-to-end.
                    </p>
                  </div>

                  {/* Active agent strip */}
                  <div className="w-full max-w-xl">
                    <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: "oklch(0.78 0.155 75)" }} />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "oklch(0.78 0.155 75)" }} />
                      </span>
                      Agents on the floor
                    </div>
                    <Marquee pauseOnHover className="[--gap:1rem] [--duration:28s]">
                      {AGENTS.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                          style={{
                            background: "oklch(1 0.005 85)",
                            boxShadow: "0 1px 6px oklch(0.50 0.02 65 / 0.05), 0 0 0 1px oklch(0.85 0.015 75 / 0.45)",
                            color: "oklch(0.30 0.015 65)",
                          }}
                        >
                          <span
                            className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white"
                            style={{ background: a.color }}
                          >
                            {a.icon}
                          </span>
                          {a.name} · {a.role.split(",")[0].toLowerCase()}
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
              <RoundCard key={round.round} data={round} index={i} isStreaming={isRunning && i === rounds.length - 1} />
            ))}
            <div ref={roundsEndRef} />
          </div>

          {/* Completion CTA */}
          {!isRunning && rounds.length > 0 && (
            <BlurFade delay={0.1}>
              <Card className="text-center" style={{
                boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 0 40px rgba(180, 140, 60, 0.12)",
                borderRadius: "8px", border: "none",
                background: "linear-gradient(135deg, oklch(0.96 0.008 85), oklch(0.94 0.015 85))",
              }}>
                <CardContent className="py-8">
                  <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "oklch(0.84 0.145 85 / 15%)" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M9 12l2 2 4-4" stroke="oklch(0.60 0.14 85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="9" stroke="oklch(0.60 0.14 85)" strokeWidth="2" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px", color: "oklch(0.24 0.012 65)" }}>
                    Debate Complete
                  </h3>
                  <div className="text-sm mb-6" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                    Multi-agent debate finished. View your verification report.
                  </div>
                  <Link href={`/prove-report?id=${sessionId}`} className={buttonVariants({ size: "lg" })} style={{
                    borderRadius: "9999px", background: "oklch(0.60 0.14 85)", color: "oklch(0.99 0.005 85)",
                    boxShadow: "0 4px 16px rgba(180, 140, 60, 0.30), 0 0 30px rgba(180, 140, 60, 0.12)",
                  }}>
                    View Verification Report
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ml-2"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
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

export default function ProvePage() {
  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <Suspense fallback={<div className="space-y-6"><ProveSkeleton /><ProveSkeleton /></div>}>
        <ProveContent />
      </Suspense>
    </div>
  );
}
