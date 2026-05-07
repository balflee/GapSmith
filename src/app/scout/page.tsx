"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BlurFade } from "@/components/ui/blur-fade";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { TextAnimate } from "@/components/ui/text-animate";
import { Ripple } from "@/components/ui/ripple";
import { Marquee } from "@/components/ui/marquee";
import { Meteors } from "@/components/ui/meteors";
import { trackScoutStart } from "@/lib/events";
import { createClient } from "@/lib/supabase";

// --- Sector data ---
const SECTORS = [
  { id: "saas", label: "SaaS & Cloud", icon: "☁️", description: "B2B software, APIs, developer tools" },
  { id: "fintech", label: "Fintech", icon: "💳", description: "Payments, banking, insurance, crypto" },
  { id: "healthtech", label: "Health Tech", icon: "🏥", description: "Digital health, telehealth, biotech" },
  { id: "edtech", label: "EdTech", icon: "📚", description: "Learning platforms, skills, credentials" },
  { id: "ecommerce", label: "E-Commerce", icon: "🛒", description: "Retail, marketplaces, D2C brands" },
  { id: "ai-ml", label: "AI & ML", icon: "🤖", description: "Machine learning, LLMs, automation" },
  { id: "climate", label: "Climate Tech", icon: "🌱", description: "Clean energy, carbon, sustainability" },
  { id: "proptech", label: "PropTech", icon: "🏢", description: "Real estate, construction, smart buildings" },
  { id: "logistics", label: "Logistics", icon: "🚚", description: "Supply chain, last-mile, warehousing" },
  { id: "creator", label: "Creator Economy", icon: "🎨", description: "Content, monetization, community" },
  { id: "cybersecurity", label: "Cybersecurity", icon: "🔒", description: "Threat detection, identity, compliance" },
  { id: "devtools", label: "Developer Tools", icon: "⚙️", description: "IDEs, CI/CD, observability, infra" },
] as const;

// --- Model cost estimates ---
const MODEL_COSTS: Record<string, { name: string; costPerSector: number }> = {
  "claude-opus-4-7": { name: "Claude Opus 4.7", costPerSector: 6.00 },
  "claude-opus-4-6": { name: "Claude Opus 4.6", costPerSector: 6.00 },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6", costPerSector: 1.20 },
  "gpt-5.5-pro": { name: "GPT-5.5 Pro", costPerSector: 40.00 },
  "gpt-5.5": { name: "GPT-5.5", costPerSector: 7.50 },
  "gpt-5.4-pro": { name: "GPT-5.4 Pro", costPerSector: 40.00 },
  "gpt-5.4": { name: "GPT-5.4", costPerSector: 3.50 },
  "gpt-5.4-mini": { name: "GPT-5.4 Mini", costPerSector: 1.00 },
  "gpt-5.4-nano": { name: "GPT-5.4 Nano", costPerSector: 0.30 },
  "gemini-3.1-pro-preview": { name: "Gemini 3.1 Pro (preview)", costPerSector: 5.00 },
  "gemini-3-flash-preview": { name: "Gemini 3 Flash (preview)", costPerSector: 1.20 },
  "gemini-3.1-flash-lite-preview": { name: "Gemini 3.1 Flash-Lite (preview)", costPerSector: 0.60 },
  "gemini-2.5-pro": { name: "Gemini 2.5 Pro", costPerSector: 3.50 },
  "gemini-2.5-flash": { name: "Gemini 2.5 Flash", costPerSector: 1.00 },
  "gemini-2.5-flash-lite": { name: "Gemini 2.5 Flash-Lite", costPerSector: 0.20 },
  "MiniMax-M1": { name: "MiniMax-M1", costPerSector: 0.80 },
  "MiniMax-M2.5": { name: "MiniMax-M2.5", costPerSector: 0.60 },
  "MiniMax-M2.7": { name: "MiniMax-M2.7", costPerSector: 0.60 },
};

// --- Scan phases ---
const PHASES = [
  { id: "scanning", label: "Scanning RSS feeds & pain sources", weight: 40 },
  { id: "scoring", label: "Scoring articles & signals", weight: 35 },
  { id: "curation", label: "Curating gaps & clusters", weight: 25 },
] as const;

// --- Live signal sources (display-only — for the running-state marquee) ---
const SCAN_SOURCES = [
  "Hacker News",
  "r/startups",
  "r/SideProject",
  "r/Entrepreneur",
  "Product Hunt",
  "TechCrunch",
  "The Information",
  "GitHub Issues",
  "GitHub Trending",
  "IndieHackers",
  "Stratechery",
  "VentureBeat",
  "a16z",
  "Y Combinator",
  "Dev.to",
  "Lobsters",
  "r/SaaS",
  "r/webdev",
  "Substack",
  "X / Twitter",
] as const;

type ScanPhase = typeof PHASES[number]["id"] | "idle" | "complete" | "error";

// --- Error formatting ---
//
// The engine writes failure detail into scout_reports.progress_message.
// On a classified-upstream failure that triggered a quota refund, the
// engine appends `[quota_refunded]` (see engine/api.py
// QUOTA_REFUNDED_MARKER). We strip it here and surface it as a separate
// green sub-line in the error block.
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
  return "Scan Failed";
}

function formatErrorMessage(error: string): string {
  const cleaned = stripQuotaMarker(error);
  const lower = cleaned.toLowerCase();
  if (lower.includes("overload") || lower.includes("529")) return "The AI model provider is experiencing high traffic. Please wait a few minutes and try again.";
  if (lower.includes("503") || lower.includes("service unavailable") || lower.includes("unavailable")) return "The AI model provider's API is currently unavailable. This is on their end, not yours — try again in a few minutes, or switch to a different model in Settings.";
  if (lower.includes("rate") || lower.includes("429") || lower.includes("too many requests")) return "You've hit the API rate limit. Please wait or switch to a different model.";
  if (lower.includes("timeout") || lower.includes("timed out")) return "The scan took too long. Try fewer sectors, or try again in a moment.";
  if (lower.includes("connection") || lower.includes("network")) return "Could not reach the AI provider. Check your internet connection or try again in a moment.";
  if (lower.includes("api key") || lower.includes("401")) return "Your API key may be invalid or expired. Check your Settings page.";
  return cleaned.replace(/^Error:\s*/i, "").substring(0, 200) || "Something went wrong during the scan. Please try again.";
}

export default function ScoutPage() {
  const router = useRouter();
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stallCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- State ---
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6");
  const [focusKeywords, setFocusKeywords] = useState("");
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [phaseMessage, setPhaseMessage] = useState("");
  const [logEntries, setLogEntries] = useState<{ time: string; msg: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Past reports
  const [pastReports, setPastReports] = useState<Array<{
    id: string; sectors: string[]; label: string; status: string;
    created_at: string; total_cost_usd: number; model: string;
  }>>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // --- Check auth on mount + cleanup Realtime on unmount ---
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
    // Fetch past reports
    (async () => {
      const { data } = await supabase
        .from("scout_reports")
        .select("id, sectors, label, status, created_at, total_cost_usd, model")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setPastReports(data as typeof pastReports);
      setLoadingReports(false);
    })();
    return () => {
      channelRef.current?.unsubscribe();
      if (stallCheckRef.current) clearInterval(stallCheckRef.current);
    };
    // eslint-disable-next-line
  }, [supabase, router]);

  // --- Auto-scroll activity log ---
  useEffect(() => {
    // Scroll only the inner log container — not the page.
    // scrollIntoView walks up to the document scroller, which yanked the
    // viewport down on every new log entry. scrollTop assignment is local.
    const el = logContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logEntries]);

  // --- Toggle sector selection ---
  const toggleSector = useCallback((sectorId: string) => {
    setSelectedSectors((prev) => {
      if (prev.includes(sectorId)) return prev.filter((s) => s !== sectorId);
      if (prev.length >= 3) return prev;
      return [...prev, sectorId];
    });
  }, []);

  // --- Estimated cost calculation ---
  const estimatedCost = selectedSectors.length * (MODEL_COSTS[selectedModel]?.costPerSector ?? 1.0);

  // --- Start scan ---
  const startScan = useCallback(async () => {
    if (selectedSectors.length < 2) return;

    trackScoutStart({ sector_count: selectedSectors.length });
    setPhase("scanning");
    setProgress(0);
    setLogEntries([]);
    setError(null);

    try {
      // 1. Create session via API
      const response = await fetch("/api/scout/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectors: selectedSectors,
          model: selectedModel,
          focus_keywords: focusKeywords.split(",").map((k) => k.trim()).filter(Boolean),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Quota exhausted — redirect to Done-For-You upsell instead of generic error
        if (response.status === 402 && errorData.reason === "quota_exhausted") {
          alert(
            `You've used all ${errorData.total} included Scout runs this year.\n\n` +
            `For more Scout reports, order our premium Done-For-You service ($39, ` +
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
        throw new Error(errorData.error || "Failed to start scan");
      }

      const { id: reportId } = await response.json();

      // 2. Subscribe to Supabase Realtime for progress updates
      let lastProgressTime = Date.now();

      const channel = supabase
        .channel(`scout-progress-${reportId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "scout_reports",
            filter: `id=eq.${reportId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const row = payload.new as {
              progress: number;
              progress_message: string;
              status: string;
            };

            lastProgressTime = Date.now();

            // Update progress bar and message
            setProgress(row.progress);
            setPhaseMessage(row.progress_message);

            // Append to activity log
            if (row.progress_message) {
              const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
              setLogEntries((prev) => [...prev, { time, msg: row.progress_message }]);
            }

            // Map engine progress % to UI phase
            if (row.progress < 35) setPhase("scanning");
            else if (row.progress < 70) setPhase("scoring");
            else setPhase("curation");

            // Terminal states
            if (row.status === "complete") {
              setPhase("complete");
              setProgress(100);
              setTimeout(() => router.push(`/scout-report?id=${reportId}`), 1200);
              channel.unsubscribe();
              channelRef.current = null;
            } else if (row.status === "error") {
              setPhase("error");
              // Surface the engine's progress_message so the user sees the
              // actual upstream error (and the [quota_refunded] marker if
              // applicable) instead of a generic line.
              setError(row.progress_message || "The scan encountered an error. Please try again.");
              channel.unsubscribe();
              channelRef.current = null;
            }
          }
        )
        .subscribe();

      channelRef.current = channel;

      // 3. Stall detection — poll API if no progress for 60s
      stallCheckRef.current = setInterval(async () => {
        if (!channelRef.current) {
          clearInterval(stallCheckRef.current!);
          return;
        }
        if (Date.now() - lastProgressTime > 60_000) {
          try {
            const check = await fetch(`/api/scout/${reportId}`);
            if (check.ok) {
              const data = await check.json();
              if (data.status === "error") {
                setPhase("error");
                setError(data.progress_message || "The scan encountered an error. Please try again.");
                channel.unsubscribe();
                channelRef.current = null;
                clearInterval(stallCheckRef.current!);
              } else if (data.status === "complete") {
                setPhase("complete");
                setProgress(100);
                setTimeout(() => router.push(`/scout-report?id=${reportId}`), 1200);
                channel.unsubscribe();
                channelRef.current = null;
                clearInterval(stallCheckRef.current!);
              }
              // still running — update progress from DB
              if (data.progress > 0) {
                setProgress(data.progress);
                setPhaseMessage(data.progress_message || "");
                lastProgressTime = Date.now();
              }
            }
          } catch {
            // ignore fetch errors
          }
        }
      }, 15_000);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "An unexpected error occurred");
    }
  }, [selectedSectors, selectedModel, router, supabase]);

  // --- Cancel scan ---
  const cancelScan = useCallback(() => {
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    if (stallCheckRef.current) clearInterval(stallCheckRef.current);
    stallCheckRef.current = null;
    setPhase("idle");
    setProgress(0);
    setPhaseMessage("");
    setLogEntries([]);
  }, []);

  // --- Determine current phase index for visual ---
  const currentPhaseIndex = PHASES.findIndex((p) => p.id === phase);
  const isRunning = phase !== "idle" && phase !== "complete" && phase !== "error";

  // --- Loading skeleton ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-[960px] px-6 py-12">
          <div className="space-y-8">
            <div className="space-y-3">
              <Skeleton className="h-10 w-64 bg-muted" />
              <Skeleton className="h-5 w-96 bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-28 rounded-lg bg-muted"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
            <Skeleton className="h-14 w-full rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  // --- Running / scanning state ---
  if (isRunning) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        {/* === Atmospheric background: radar sweep + concentric rings + meteors === */}
        <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden="true">
          {/* Soft radial wash */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 35%, oklch(0.60 0.14 178 / 0.08), transparent 70%), radial-gradient(ellipse 40% 40% at 25% 75%, oklch(0.62 0.155 52 / 0.05), transparent 60%)",
            }}
          />
          {/* Radar sweep — slowly rotating conic gradient */}
          <div
            className="absolute left-1/2 top-1/3 h-[860px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.35] motion-reduce:hidden"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, oklch(0.60 0.14 178 / 0.18) 35deg, transparent 80deg)",
              animation: "spin-around 8s linear infinite",
              maskImage: "radial-gradient(circle at center, black 0%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(circle at center, black 0%, transparent 70%)",
            }}
          />
          {/* Concentric guide rings */}
          {[280, 460, 640].map((size, i) => (
            <div
              key={size}
              className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: size,
                height: size,
                boxShadow: `0 0 0 1px oklch(0.60 0.14 178 / ${0.10 - i * 0.02})`,
                opacity: 0.6,
              }}
            />
          ))}
          {/* Drifting meteors — data points crossing the field */}
          <div className="absolute inset-0">
            <Meteors number={12} />
          </div>
        </div>

        <div className="relative z-10 mx-auto flex max-w-[960px] flex-col items-center justify-center px-6 py-24">
          <BlurFade delay={0.1}>
            <div className="flex flex-col items-center gap-8">
              {/* Circular progress with ripple halo */}
              <div className="relative flex items-center justify-center" style={{ height: 240, width: 240 }}>
                <div className="absolute inset-0 flex items-center justify-center motion-reduce:hidden">
                  <Ripple
                    mainCircleSize={170}
                    mainCircleOpacity={0.18}
                    numCircles={4}
                    className="[&_div]:!border-scout/35"
                  />
                </div>
                <AnimatedCircularProgressBar
                  value={progress}
                  max={100}
                  min={0}
                  gaugePrimaryColor="oklch(0.60 0.14 178)"
                  gaugeSecondaryColor="oklch(0.94 0.010 85)"
                  className="relative z-10 h-40 w-40"
                />
              </div>

              {/* Phase label with live "thinking" dots */}
              <div className="text-center">
                <div className="inline-flex items-baseline gap-1">
                  <TextAnimate
                    key={phase}
                    animation="blurIn"
                    className="font-heading text-2xl font-bold text-foreground"
                    style={{ letterSpacing: "-1.5px", lineHeight: "1.08" }}
                  >
                    {PHASES.find((p) => p.id === phase)?.label || "Processing..."}
                  </TextAnimate>
                  <span className="ml-1 inline-flex gap-1 motion-reduce:hidden" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-scout [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-scout [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-scout" />
                  </span>
                </div>
                {phaseMessage && (
                  <p className="mt-2 text-sm text-muted-foreground" style={{ lineHeight: "1.55" }}>
                    {phaseMessage}
                  </p>
                )}
              </div>

              {/* Phase stepper */}
              <div className="flex w-full max-w-md items-center gap-3">
                {PHASES.map((p, i) => {
                  const isActive = p.id === phase;
                  const isDone = currentPhaseIndex > i || (phase as ScanPhase) === "complete";
                  return (
                    <div key={p.id} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                          isDone
                            ? "bg-scout text-background"
                            : isActive
                            ? "bg-scout/25 text-scout ring-2 ring-scout/50"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isDone ? "✓" : i + 1}
                      </div>
                      <span
                        className={`text-center text-xs transition-colors duration-300 ${
                          isActive ? "font-medium text-scout" : "text-muted-foreground"
                        }`}
                      >
                        {p.id === "scanning" ? "Scan" : p.id === "scoring" ? "Score" : "Curate"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Linear progress bar */}
              <div className="w-full max-w-md">
                <Progress value={progress} className="h-2 [&>div]:bg-scout" />
              </div>

              {/* Activity log */}
              {logEntries.length > 0 && (
                <div
                  className="w-full max-w-md rounded-lg bg-card p-4"
                  style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-scout" />
                    <span className="text-xs font-medium text-muted-foreground">Activity Log</span>
                  </div>
                  <div
                    ref={logContainerRef}
                    className="max-h-36 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground"
                  >
                    {logEntries.map((entry, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 ${i === logEntries.length - 1 ? "text-foreground" : ""}`}
                      >
                        <span className="shrink-0 text-muted-foreground/60">{entry.time}</span>
                        <span>{entry.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected sectors recap */}
              <div className="flex flex-wrap justify-center gap-2">
                {selectedSectors.map((sId) => {
                  const sector = SECTORS.find((s) => s.id === sId);
                  return (
                    <Badge
                      key={sId}
                      variant="secondary"
                      className="bg-scout/10 text-scout"
                    >
                      {sector?.icon} {sector?.label}
                    </Badge>
                  );
                })}
              </div>

              {/* Live source-feed marquee — conveys "agents working through real sources right now" */}
              <div className="w-full max-w-2xl">
                <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-scout opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-scout" />
                  </span>
                  Live signal sources
                </div>
                <Marquee pauseOnHover className="[--gap:1.25rem] [--duration:40s]">
                  {SCAN_SOURCES.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                      style={{
                        background: "oklch(1 0.005 85)",
                        boxShadow: "0 1px 6px oklch(0.50 0.02 65 / 0.05), 0 0 0 1px oklch(0.85 0.015 75 / 0.45)",
                        color: "oklch(0.30 0.015 65)",
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-scout/70" />
                      {s}
                    </span>
                  ))}
                </Marquee>
              </div>

              {/* Cancel button */}
              <Button
                variant="outline"
                onClick={cancelScan}
                className="rounded-full border-none text-muted-foreground transition-all duration-200 hover:text-foreground"
                style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
              >
                Cancel Scan
              </Button>
            </div>
          </BlurFade>
        </div>
      </div>
    );
  }

  // --- Complete state (brief flash before redirect) ---
  if (phase === "complete") {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex max-w-[960px] flex-col items-center justify-center px-6 py-24">
          <BlurFade delay={0.05}>
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-scout/20">
                <span className="text-4xl">✓</span>
              </div>
              <h2
                className="font-heading text-3xl font-bold text-foreground"
                style={{ letterSpacing: "-1.5px", lineHeight: "1.08" }}
              >
                Scout Report Ready
              </h2>
              <p className="text-muted-foreground" style={{ lineHeight: "1.55" }}>
                Redirecting to your report...
              </p>
            </div>
          </BlurFade>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex max-w-[960px] flex-col items-center justify-center px-6 py-24">
          <BlurFade delay={0.1}>
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/20">
                <span className="text-4xl">!</span>
              </div>
              <h2
                className="font-heading text-3xl font-bold text-foreground"
                style={{ letterSpacing: "-1.5px", lineHeight: "1.08" }}
              >
                {error ? formatErrorTitle(error) : "Scan Failed"}
              </h2>
              <p className="max-w-md text-muted-foreground" style={{ lineHeight: "1.55" }}>
                {error ? formatErrorMessage(error) : "Something went wrong during the scan. Please try again."}
              </p>
              {error && wasQuotaRefunded(error) && (
                <div
                  className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{
                    backgroundColor: "oklch(0.95 0.05 145)",
                    color: "oklch(0.40 0.13 145)",
                    border: "1px solid oklch(0.85 0.08 145)",
                  }}
                >
                  ✓ Your Scout run quota was NOT used — retry anytime.
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setPhase("idle");
                    setError(null);
                    setProgress(0);
                  }}
                  className="rounded-full bg-scout px-6 font-semibold text-background transition-all duration-200 hover:opacity-90"
                >
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push("/settings")}
                  className="rounded-full border-none transition-all duration-200"
                  style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
                >
                  Check Settings
                </Button>
              </div>
            </div>
          </BlurFade>
        </div>
      </div>
    );
  }

  // --- Default: sector selection UI ---
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[960px] px-6 py-12">
        {/* Header */}
        <BlurFade delay={0.05}>
          <div className="mb-10 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-scout/15">
                <span className="text-lg text-scout">🔭</span>
              </div>
              <h1
                className="font-heading text-4xl font-bold text-foreground"
                style={{ letterSpacing: "-2px", lineHeight: "1.08" }}
              >
                New Scout Report
              </h1>
            </div>
            <p
              className="max-w-lg text-muted-foreground"
              style={{ lineHeight: "1.55", letterSpacing: "-0.1px" }}
            >
              Select 2-3 industry sectors to scan. Scout will analyze RSS feeds,
              pain forums, and market signals to surface gaps worth pursuing.
            </p>
          </div>
        </BlurFade>

        {/* Sector grid */}
        <BlurFade delay={0.15}>
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="font-heading text-lg font-semibold text-foreground"
                style={{ letterSpacing: "-0.5px" }}
              >
                Industry Sectors
              </h2>
              <span className="text-sm text-muted-foreground">
                {selectedSectors.length}/3 selected
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {SECTORS.map((sector, i) => {
                const isSelected = selectedSectors.includes(sector.id);
                const isDisabled = selectedSectors.length >= 3 && !isSelected;
                return (
                  <BlurFade key={sector.id} delay={0.05 + i * 0.03}>
                    <button
                      onClick={() => toggleSector(sector.id)}
                      disabled={isDisabled}
                      className={`group relative flex w-full flex-col items-start gap-2 rounded-lg p-4 text-left transition-all duration-200 ${
                        isSelected
                          ? "bg-scout/10 text-foreground"
                          : isDisabled
                          ? "cursor-not-allowed opacity-40"
                          : "bg-card text-foreground hover:bg-scout/5"
                      }`}
                      style={{
                        boxShadow: isSelected
                          ? "0 0 0 2px oklch(0.72 0.12 178 / 50%), 0 0 20px oklch(0.72 0.12 178 / 8%)"
                          : "0 0 0 1px oklch(0.92 0.015 85 / 10%)",
                      }}
                    >
                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-scout text-xs text-background">
                          ✓
                        </div>
                      )}
                      <span className="text-2xl">{sector.icon}</span>
                      <div>
                        <div className="text-sm font-semibold" style={{ letterSpacing: "-0.3px" }}>
                          {sector.label}
                        </div>
                        <div
                          className="mt-0.5 text-xs text-muted-foreground"
                          style={{ lineHeight: "1.4" }}
                        >
                          {sector.description}
                        </div>
                      </div>
                    </button>
                  </BlurFade>
                );
              })}
            </div>
          </div>
        </BlurFade>

        <Separator className="my-8 bg-border" />

        {/* Model selector + cost estimate */}
        <BlurFade delay={0.25}>
          <div className="mb-8">
            <h2
              className="mb-4 font-heading text-lg font-semibold text-foreground"
              style={{ letterSpacing: "-0.5px" }}
            >
              Model & Cost Estimate
            </h2>
            <Card
              className="border-none bg-card"
              style={{
                boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)",
              }}
            >
              <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
                {/* Model select */}
                <div className="flex-1 space-y-2">
                  <label
                    className="text-sm font-medium text-muted-foreground"
                    style={{ letterSpacing: "-0.1px" }}
                  >
                    LLM Model
                  </label>
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
                        <span className="text-xs text-muted-foreground">Estimated API cost</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          Based on ~{MODEL_COSTS[selectedModel]?.costPerSector.toFixed(2)} per sector.
                          Actual cost depends on content volume.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="font-heading text-3xl font-bold text-scout"
                      style={{ letterSpacing: "-1.5px" }}
                    >
                      ${estimatedCost.toFixed(2)}
                    </span>
                    <span className="text-sm text-muted-foreground">USD</span>
                  </div>
                  {selectedSectors.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Select sectors to see estimate
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </BlurFade>

        {/* Focus keywords (optional) */}
        <BlurFade delay={0.3}>
          <div className="mb-8">
            <h2
              className="mb-2 font-heading text-lg font-semibold text-foreground"
              style={{ letterSpacing: "-0.5px" }}
            >
              Focus Keywords
              <span className="ml-2 text-sm font-normal text-muted-foreground">(optional)</span>
            </h2>
            <p className="mb-3 text-xs text-muted-foreground" style={{ lineHeight: "1.5" }}>
              Add keywords to highlight matching signals in your report. All signals are still scanned — keywords help you spot what matters most.
            </p>
            <input
              type="text"
              value={focusKeywords}
              onChange={(e) => setFocusKeywords(e.target.value)}
              placeholder="e.g. AI code review, compliance automation, API gateway"
              className="w-full rounded-lg bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-scout/30"
              style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}
            />
          </div>
        </BlurFade>

        {/* Start button */}
        <BlurFade delay={0.35}>
          <div className="flex flex-col items-center gap-4">
            <Button
              onClick={startScan}
              disabled={selectedSectors.length < 2}
              className="w-full rounded-full bg-scout px-10 py-6 text-lg font-bold text-background transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              style={{
                boxShadow: selectedSectors.length >= 2
                  ? "0 0 30px oklch(0.72 0.12 178 / 15%), 0 4px 12px oklch(0.72 0.12 178 / 10%)"
                  : "none",
              }}
            >
              Start Scout Report
            </Button>
            {selectedSectors.length < 2 && (
              <p className="text-sm text-muted-foreground">
                Select at least 2 sectors to begin
              </p>
            )}
          </div>
        </BlurFade>

        {/* Your Past Reports */}
        <BlurFade delay={0.4}>
          <Separator className="my-10" />
          <div className="mb-8">
            <h2
              className="mb-4 font-heading text-lg font-semibold text-foreground"
              style={{ letterSpacing: "-0.5px" }}
            >
              Your Past Reports
            </h2>

            {loadingReports ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : pastReports.length === 0 ? (
              <Card className="border-none" style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)" }}>
                <CardContent className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    No reports yet. Start your first Scout scan above.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pastReports.map((report) => {
                  const isEditing = editingLabel === report.id;
                  const dateStr = new Date(report.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  const timeStr = new Date(report.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                  const displayLabel = report.label || (report.sectors as string[])?.join(", ") || "Untitled Report";
                  const isComplete = report.status === "complete";
                  const isError = report.status === "error";

                  return (
                    <Card
                      key={report.id}
                      className="group border-none transition-all duration-200 hover:translate-y-[-1px]"
                      style={{
                        boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 10%)",
                        opacity: isError ? 0.6 : 1,
                      }}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        {/* Status dot */}
                        <div
                          className="shrink-0 w-2.5 h-2.5 rounded-full"
                          style={{
                            background: isComplete ? "oklch(0.65 0.16 155)"
                              : isError ? "oklch(0.55 0.2 25)"
                              : "oklch(0.80 0.14 85)",
                          }}
                        />

                        {/* Label + meta */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                await fetch(`/api/scout/${report.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ label: editLabelValue }),
                                });
                                setPastReports(prev => prev.map(r =>
                                  r.id === report.id ? { ...r, label: editLabelValue } : r
                                ));
                                setEditingLabel(null);
                              }}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="text"
                                value={editLabelValue}
                                onChange={(e) => setEditLabelValue(e.target.value)}
                                className="flex-1 text-sm rounded px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-scout/30"
                                style={{ boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 15%)" }}
                                autoFocus
                                maxLength={100}
                                onKeyDown={(e) => { if (e.key === "Escape") setEditingLabel(null); }}
                              />
                              <button type="submit" className="text-xs font-medium px-2 py-1 rounded" style={{ color: "oklch(0.65 0.16 155)" }}>
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingLabel(null)} className="text-xs text-muted-foreground px-2 py-1">
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <button
                              onClick={() => {
                                if (isComplete) router.push(`/scout-report?id=${report.id}`);
                              }}
                              className="text-left w-full"
                              disabled={!isComplete}
                            >
                              <div className="text-sm font-medium truncate" style={{ color: isComplete ? "oklch(0.24 0.012 65)" : "oklch(0.50 0.02 65)" }}>
                                {displayLabel}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-muted-foreground">{dateStr} {timeStr}</span>
                                {report.model && (
                                  <span className="text-xs text-muted-foreground">{report.model}</span>
                                )}
                                {report.total_cost_usd > 0 && (
                                  <span className="text-xs text-muted-foreground">${report.total_cost_usd.toFixed(2)}</span>
                                )}
                                {!isComplete && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {report.status}
                                  </Badge>
                                )}
                              </div>
                            </button>
                          )}
                        </div>

                        {/* Sector badges */}
                        <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px] justify-end">
                          {(report.sectors as string[])?.slice(0, 3).map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {s}
                            </Badge>
                          ))}
                          {(report.sectors as string[])?.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{(report.sectors as string[]).length - 3}</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {/* Rename */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingLabel(report.id);
                              setEditLabelValue(report.label || "");
                            }}
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                            title="Rename"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M10 1.5l2.5 2.5L4.5 12H2v-2.5L10 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground" />
                            </svg>
                          </button>
                          {/* Forge from this */}
                          {isComplete && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/forge?from_scout=${report.id}`);
                              }}
                              className="p-1.5 rounded hover:bg-muted transition-colors"
                              title="Generate ideas from this report"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M7 1L8.75 5.25L13 7L8.75 8.75L7 13L5.25 8.75L1 7L5.25 5.25L7 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" className="text-muted-foreground" />
                              </svg>
                            </button>
                          )}
                          {/* Delete — two-step confirm */}
                          {confirmDeleteId === report.id ? (
                            <div className="flex items-center gap-1 pl-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[11px] whitespace-nowrap" style={{ color: "oklch(0.55 0.2 25)" }}>Delete?</span>
                              <button
                                onClick={async () => {
                                  setDeletingId(report.id);
                                  await fetch(`/api/scout/${report.id}`, { method: "DELETE" });
                                  setPastReports(prev => prev.filter(r => r.id !== report.id));
                                  setDeletingId(null);
                                  setConfirmDeleteId(null);
                                }}
                                disabled={deletingId === report.id}
                                className="text-[11px] font-medium px-1.5 py-0.5 rounded hover:bg-destructive/10 transition-colors"
                                style={{ color: "oklch(0.55 0.2 25)" }}
                              >
                                {deletingId === report.id ? "..." : "Yes"}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(report.id);
                              }}
                              className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                              title="Delete report"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M2 4h10M5 4V2.5h4V4M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" stroke="oklch(0.55 0.2 25)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </BlurFade>
      </div>
    </div>
  );
}
