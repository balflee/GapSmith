"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { BlurFade } from "@/components/ui/blur-fade";
import { trackApiKeySaved } from "@/lib/events";

// ---------------------------------------------------------------------------
// Provider & model definitions
// ---------------------------------------------------------------------------

interface ModelInfo {
  id: string;
  name: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
}

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  placeholder: string;
  prefix: string;
  models: ModelInfo[];
  scoutEstimate: string;
  forgeEstimate: string;
  proveEstimate: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic / Claude",
    description: "Claude models with strong reasoning and safety",
    placeholder: "sk-ant-api03-...",
    prefix: "sk-ant-",
    models: [
      { id: "claude-opus-4-7", name: "Claude Opus 4.7", inputCostPer1k: 0.015, outputCostPer1k: 0.075 },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", inputCostPer1k: 0.015, outputCostPer1k: 0.075 },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", inputCostPer1k: 0.003, outputCostPer1k: 0.015 },
    ],
    scoutEstimate: "$2.00 - $12.00",
    forgeEstimate: "$3.00 - $15.00",
    proveEstimate: "$5.00 - $25.00",
    accentColor: "oklch(0.70 0.12 178)",
    accentBg: "oklch(0.70 0.12 178 / 0.08)",
    accentBorder: "oklch(0.70 0.12 178 / 0.20)",
  },
  {
    id: "openai",
    name: "OpenAI / GPT",
    description: "GPT models with broad capabilities",
    placeholder: "sk-proj-...",
    prefix: "sk-",
    models: [
      { id: "gpt-5.5-pro", name: "GPT-5.5 Pro", inputCostPer1k: 0.030, outputCostPer1k: 0.180 },
      { id: "gpt-5.5", name: "GPT-5.5", inputCostPer1k: 0.005, outputCostPer1k: 0.030 },
      { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", inputCostPer1k: 0.030, outputCostPer1k: 0.180 },
      { id: "gpt-5.4", name: "GPT-5.4", inputCostPer1k: 0.0025, outputCostPer1k: 0.015 },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", inputCostPer1k: 0.00075, outputCostPer1k: 0.0045 },
      { id: "gpt-5.4-nano", name: "GPT-5.4 Nano", inputCostPer1k: 0.0002, outputCostPer1k: 0.00125 },
    ],
    scoutEstimate: "$0.30 - $40.00",
    forgeEstimate: "$0.20 - $30.00",
    proveEstimate: "$0.50 - $60.00",
    accentColor: "oklch(0.60 0.16 155)",
    accentBg: "oklch(0.60 0.16 155 / 0.08)",
    accentBorder: "oklch(0.60 0.16 155 / 0.20)",
  },
  {
    id: "google",
    name: "Google / Gemini",
    description: "Gemini models with multimodal strengths",
    placeholder: "AIza...",
    prefix: "AIza",
    models: [
      // Gemini 3.x line — current frontier (preview tier)
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (preview)", inputCostPer1k: 0.002, outputCostPer1k: 0.012 },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash (preview)", inputCostPer1k: 0.0005, outputCostPer1k: 0.003 },
      { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash-Lite (preview)", inputCostPer1k: 0.00025, outputCostPer1k: 0.0015 },
      // Gemini 2.5 line — stable GA
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", inputCostPer1k: 0.00125, outputCostPer1k: 0.01 },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", inputCostPer1k: 0.0003, outputCostPer1k: 0.0025 },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", inputCostPer1k: 0.0001, outputCostPer1k: 0.0004 },
    ],
    scoutEstimate: "$0.30 - $6.00",
    forgeEstimate: "$0.40 - $4.00",
    proveEstimate: "$0.80 - $9.00",
    accentColor: "oklch(0.60 0.12 260)",
    accentBg: "oklch(0.60 0.12 260 / 0.08)",
    accentBorder: "oklch(0.60 0.12 260 / 0.20)",
  },
  // Hidden providers (engine routing kept; re-enable by re-adding the entry):
  //   - { id: "deepseek", ... }
  //   - { id: "qwen", ... }
  //   - { id: "xai", ... }   removed 2026-04-29 — Grok 4 underperformed on
  //                          Scout vs Sonnet 4.6 / MiniMax for similar cost
  {
    id: "minimax",
    name: "MiniMax",
    description: "Advanced multimodal models from MiniMax",
    placeholder: "sk-api-...",
    prefix: "sk-",
    models: [
      { id: "MiniMax-M1", name: "MiniMax-M1", inputCostPer1k: 0.002, outputCostPer1k: 0.008 },
      { id: "MiniMax-M2.5", name: "MiniMax-M2.5", inputCostPer1k: 0.0015, outputCostPer1k: 0.006 },
      { id: "MiniMax-M2.7", name: "MiniMax-M2.7", inputCostPer1k: 0.0015, outputCostPer1k: 0.006 },
      { id: "MiniMax-Text-01", name: "MiniMax-Text-01", inputCostPer1k: 0.0004, outputCostPer1k: 0.0016 },
    ],
    scoutEstimate: "$0.60 - $2.00",
    forgeEstimate: "$0.80 - $2.50",
    proveEstimate: "$1.50 - $5.00",
    accentColor: "oklch(0.58 0.18 320)",
    accentBg: "oklch(0.58 0.18 320 / 0.08)",
    accentBorder: "oklch(0.58 0.18 320 / 0.20)",
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavedKey {
  id: string;
  provider: string;
  model: string | null;
  created_at: string;
  key_preview: string;
}

type ValidationStatus =
  | { state: "idle" }
  | { state: "validating" }
  | { state: "success"; modelName: string }
  | { state: "error"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

function getProviderInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Settings Page Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  // Saved keys state
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Trial users don't need a BYOK key — runs use the company-funded
  // MiniMax key server-side. Grey out the form so the trial UX doesn't
  // tell them to do something pointless.
  const [isTrial, setIsTrial] = useState(false);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>({ state: "idle" });
  const [isMounted, setIsMounted] = useState(false);

  const provider = PROVIDERS.find((p) => p.id === selectedProvider);

  // The provider shown in the right column: selected form provider or most recent saved key
  const activeProvider = provider ?? (savedKeys.length > 0 ? getProviderInfo(savedKeys[0].provider) : undefined);

  // Fetch saved keys
  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/api-key");
      if (res.ok) {
        const data = await res.json();
        setSavedKeys(data.keys ?? []);
      }
    } catch {
      // Silently fail — empty state will show
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    fetchKeys();
    // Pull is_trial alongside; non-blocking.
    (async () => {
      try {
        const r = await fetch("/api/quota");
        if (!r.ok) return;
        const q = await r.json();
        if (q.is_trial) setIsTrial(true);
      } catch { /* non-blocking */ }
    })();
  }, [fetchKeys]);

  // Reset form fields when provider changes
  useEffect(() => {
    setSelectedModel("");
    setValidationStatus({ state: "idle" });
    setApiKey("");
    setShowKey(false);
  }, [selectedProvider]);

  const handleSaveAndValidate = useCallback(async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setValidationStatus({ state: "validating" });

    try {
      const res = await fetch("/api/settings/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: apiKey.trim(),
          model: selectedModel || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setValidationStatus({ state: "error", message: data.error || "Validation failed" });
        return;
      }

      const validatedModel = data.model || selectedModel || "default";
      setValidationStatus({ state: "success", modelName: validatedModel });

      trackApiKeySaved({ provider: selectedProvider, model: validatedModel });

      // Refresh the keys list and collapse form after a brief pause
      await fetchKeys();
      setTimeout(() => {
        setShowAddForm(false);
        setSelectedProvider("");
        setApiKey("");
        setSelectedModel("");
        setValidationStatus({ state: "idle" });
      }, 1500);
    } catch {
      setValidationStatus({
        state: "error",
        message: "Network error. Please check your connection and try again.",
      });
    }
  }, [selectedProvider, apiKey, selectedModel, fetchKeys]);

  const handleDeleteKey = useCallback(async (keyId: string) => {
    // Two-click: first click shows confirmation, second deletes
    if (deletingId !== keyId) {
      setDeletingId(keyId);
      // Auto-cancel after 3 seconds
      setTimeout(() => setDeletingId((current) => (current === keyId ? null : current)), 3000);
      return;
    }

    try {
      const res = await fetch("/api/settings/api-key", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: keyId }),
      });
      if (res.ok) {
        setSavedKeys((prev) => prev.filter((k) => k.id !== keyId));
      }
    } catch {
      // Silently fail
    } finally {
      setDeletingId(null);
    }
  }, [deletingId]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderStatusIndicator = () => {
    switch (validationStatus.state) {
      case "idle":
        return null;
      case "validating":
        return (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3"
            style={{ boxShadow: "0 0 0 1px rgba(212, 116, 60, 0.08)" }}>
            <div className="relative h-4 w-4">
              <div className="absolute inset-0 animate-spin rounded-full"
                style={{ border: "2px solid transparent", borderTopColor: "oklch(0.68 0.155 52)", borderRightColor: "oklch(0.68 0.155 52 / 0.3)" }} />
            </div>
            <span className="text-sm text-muted-foreground">Validating your API key...</span>
          </div>
        );
      case "success":
        return (
          <div className="flex items-center gap-3 rounded-lg px-4 py-3"
            style={{ background: "oklch(0.65 0.16 155 / 0.08)", boxShadow: "0 0 0 1px oklch(0.65 0.16 155 / 0.15)" }}>
            <div className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "oklch(0.65 0.16 155)" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="oklch(0.98 0 0)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm" style={{ color: "oklch(0.72 0.12 155)" }}>Key validated successfully</span>
            <Badge variant="secondary" className="ml-auto text-xs font-mono"
              style={{ background: "oklch(0.65 0.16 155 / 0.12)", color: "oklch(0.72 0.12 155)" }}>
              {validationStatus.modelName}
            </Badge>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-3 rounded-lg px-4 py-3"
            style={{ background: "oklch(0.55 0.22 25 / 0.08)", boxShadow: "0 0 0 1px oklch(0.55 0.22 25 / 0.15)" }}>
            <div className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "oklch(0.55 0.22 25)" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="oklch(0.98 0 0)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-sm" style={{ color: "oklch(0.65 0.18 25)" }}>{validationStatus.message}</span>
          </div>
        );
    }
  };

  // ---------------------------------------------------------------------------
  // Skeleton during hydration
  // ---------------------------------------------------------------------------

  if (!isMounted) {
    return (
      <div className="mx-auto max-w-[960px] px-6 py-12">
        <div className="space-y-2 mb-10">
          <Skeleton className="h-10 w-48" style={{ background: "oklch(0.93 0.012 85)" }} />
          <Skeleton className="h-5 w-96" style={{ background: "oklch(0.95 0.010 85)" }} />
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-6">
            <Skeleton className="h-[420px] rounded-lg" style={{ background: "oklch(0.95 0.010 85)" }} />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-[300px] rounded-lg" style={{ background: "oklch(0.95 0.010 85)" }} />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-[960px] px-6 py-12">
      {/* ---- Page header ---- */}
      <div className="mb-10 space-y-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight"
          style={{ letterSpacing: "-1.5px", lineHeight: "1.08" }}>
          Settings
        </h1>
        <p className="text-base text-muted-foreground" style={{ lineHeight: "1.55" }}>
          Connect your LLM providers to power Scout, Forge, and Prove pipelines.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ================================================================
            LEFT COLUMN: Saved Keys + Add Form
            ================================================================ */}
        <div className="lg:col-span-3 space-y-6">

          {/* ---- Trial banner ----
              Free-trial users run on our MiniMax key server-side, so the
              BYOK form is dead weight for them. Grey-out + explanation
              prevents the "I added a key but it's still using MiniMax?!"
              support ticket. */}
          {isTrial && (
            <BlurFade delay={0.08}>
              <div
                className="rounded-lg p-4 flex gap-3"
                style={{
                  background: "oklch(0.97 0.04 155 / 0.6)",
                  boxShadow: "inset 0 0 0 1px oklch(0.55 0.16 155 / 0.25)",
                }}
              >
                <div
                  className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-base"
                  style={{
                    background: "oklch(0.55 0.16 155 / 0.15)",
                    color: "oklch(0.40 0.16 155)",
                  }}
                  aria-hidden
                >
                  ✦
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold mb-0.5" style={{ color: "oklch(0.30 0.015 65)" }}>
                    You&apos;re on the free trial
                  </div>
                  <p className="text-xs" style={{ color: "oklch(0.45 0.02 65)", lineHeight: 1.55 }}>
                    Your trial runs use our MiniMax-M2.7 key — no API key setup needed.
                    Adding your own key here won&apos;t take effect until you{" "}
                    <Link href="/pricing" className="font-medium underline" style={{ color: "oklch(0.40 0.16 155)" }}>
                      upgrade to a paid tier
                    </Link>
                    , at which point you can BYOK any provider.
                  </p>
                </div>
              </div>
            </BlurFade>
          )}

          {/* ---- Saved Keys List ----
              Wrapper visually de-emphasizes the BYOK section for trial users
              (50% opacity + slight blur) without disabling clicks — power
              users can still set up keys preemptively for after upgrade. */}
          <div
            style={isTrial ? {
              opacity: 0.55,
              filter: "saturate(0.7)",
              transition: "opacity 200ms",
            } : undefined}
          >
          {loadingKeys ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-[88px] rounded-lg" style={{ background: "oklch(0.95 0.010 85)" }} />
              ))}
            </div>
          ) : savedKeys.length === 0 && !showAddForm ? (
            /* ---- Empty State ---- */
            <BlurFade delay={0.1}>
              <Card className="overflow-hidden"
                style={{
                  boxShadow: "0 1px 3px rgba(45, 42, 38, 0.06), 0 0 0 1px oklch(0.90 0.012 75), 0 0 24px rgba(212, 116, 60, 0.06)",
                  background: "oklch(0.995 0.005 85)",
                }}>
                <CardContent className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl mb-5"
                    style={{
                      background: "oklch(0.68 0.155 52 / 0.10)",
                      boxShadow: "0 0 0 1px oklch(0.68 0.155 52 / 0.12)",
                    }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                        fill="oklch(0.68 0.155 52)" fillOpacity="0.7" />
                    </svg>
                  </div>
                  <h3 className="font-heading text-lg font-semibold mb-1.5"
                    style={{ letterSpacing: "-0.5px", color: "oklch(0.30 0.015 65)" }}>
                    No API keys connected yet
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm" style={{ lineHeight: "1.55" }}>
                    Add your first LLM provider key to start discovering and validating startup ideas.
                  </p>
                  <Button
                    onClick={() => setShowAddForm(true)}
                    className="h-11 px-6 text-base font-medium transition-all duration-200"
                    style={{
                      borderRadius: "9999px",
                      background: "oklch(0.62 0.155 52)",
                      color: "oklch(0.99 0.005 85)",
                      boxShadow: "0 0 20px rgba(212, 116, 60, 0.15), 0 0 0 1px rgba(212, 116, 60, 0.2)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = "0 0 30px rgba(212, 116, 60, 0.25), 0 0 0 1px rgba(212, 116, 60, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "0 0 20px rgba(212, 116, 60, 0.15), 0 0 0 1px rgba(212, 116, 60, 0.2)";
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mr-2">
                      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Add your first API key
                  </Button>
                </CardContent>
              </Card>
            </BlurFade>
          ) : (
            <>
              {/* ---- Saved key cards ---- */}
              {savedKeys.map((key, idx) => {
                const keyProvider = getProviderInfo(key.provider);
                const accent = keyProvider?.accentColor ?? "oklch(0.62 0.155 52)";
                const accentBg = keyProvider?.accentBg ?? "oklch(0.62 0.155 52 / 0.08)";
                const accentBorder = keyProvider?.accentBorder ?? "oklch(0.62 0.155 52 / 0.20)";

                return (
                  <BlurFade key={key.id} delay={0.05 * idx}>
                    <Card className="overflow-hidden transition-all duration-200"
                      style={{
                        boxShadow: `0 1px 3px rgba(45, 42, 38, 0.06), 0 0 0 1px ${accentBorder}`,
                        background: "oklch(0.995 0.005 85)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = `0 2px 8px rgba(45, 42, 38, 0.08), 0 0 0 1px ${accentBorder}, 0 0 20px ${accentBg}`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = `0 1px 3px rgba(45, 42, 38, 0.06), 0 0 0 1px ${accentBorder}`;
                      }}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        {/* Provider badge */}
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                          style={{ background: accentBg, boxShadow: `0 0 0 1px ${accentBorder}` }}>
                          <span className="text-sm font-bold" style={{ color: accent }}>
                            {key.provider.slice(0, 2).toUpperCase()}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold truncate" style={{ color: "oklch(0.24 0.012 65)" }}>
                              {keyProvider?.name ?? key.provider}
                            </span>
                            {key.model && (
                              <Badge variant="secondary" className="text-xs font-mono flex-shrink-0"
                                style={{ background: accentBg, color: accent, border: "none" }}>
                                {key.model}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <code className="font-mono rounded px-1.5 py-0.5"
                              style={{ background: "oklch(0.95 0.012 85)", fontSize: "11px" }}>
                              ...{key.key_preview}
                            </code>
                            <span>{relativeTime(key.created_at)}</span>
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(key.id)}
                          className="flex-shrink-0 flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200"
                          style={{
                            background: deletingId === key.id ? "oklch(0.55 0.22 25 / 0.10)" : "transparent",
                            color: deletingId === key.id ? "oklch(0.55 0.22 25)" : "oklch(0.50 0.02 65)",
                            boxShadow: deletingId === key.id ? "0 0 0 1px oklch(0.55 0.22 25 / 0.20)" : "none",
                          }}
                          onMouseEnter={(e) => {
                            if (deletingId !== key.id) {
                              e.currentTarget.style.color = "oklch(0.55 0.22 25)";
                              e.currentTarget.style.background = "oklch(0.55 0.22 25 / 0.06)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (deletingId !== key.id) {
                              e.currentTarget.style.color = "oklch(0.50 0.02 65)";
                              e.currentTarget.style.background = "transparent";
                            }
                          }}
                          aria-label={deletingId === key.id ? "Confirm delete" : "Delete API key"}
                        >
                          {deletingId === key.id ? (
                            "Confirm?"
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M4.5 3V2.5C4.5 1.67 5.17 1 6 1H10C10.83 1 11.5 1.67 11.5 2.5V3M2 3.5H14M3.5 3.5V13.5C3.5 14.33 4.17 15 5 15H11C11.83 15 12.5 14.33 12.5 13.5V3.5"
                                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </CardContent>
                    </Card>
                  </BlurFade>
                );
              })}

              {/* ---- "+ Add API Key" button (when keys exist) ---- */}
              {!showAddForm && (
                <BlurFade delay={0.05 * savedKeys.length}>
                  <Button
                    variant="outline"
                    onClick={() => setShowAddForm(true)}
                    className="w-full h-11 text-base font-medium transition-all duration-200"
                    style={{
                      borderRadius: "0.75rem",
                      background: "oklch(0.97 0.008 85)",
                      boxShadow: "0 0 0 1px oklch(0.90 0.012 75), 0 1px 2px rgba(45, 42, 38, 0.04)",
                      color: "oklch(0.40 0.02 65)",
                      borderColor: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = "0 0 0 1px oklch(0.68 0.155 52 / 0.3), 0 2px 8px rgba(212, 116, 60, 0.08)";
                      e.currentTarget.style.color = "oklch(0.62 0.155 52)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "0 0 0 1px oklch(0.90 0.012 75), 0 1px 2px rgba(45, 42, 38, 0.04)";
                      e.currentTarget.style.color = "oklch(0.40 0.02 65)";
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mr-2">
                      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Add API Key
                  </Button>
                </BlurFade>
              )}
            </>
          )}

          {/* ================================================================
              INLINE ADD FORM (expand/collapse)
              ================================================================ */}
          {showAddForm && (
            <BlurFade delay={0.05}>
              <Card className="overflow-hidden"
                style={{
                  boxShadow: "0 1px 3px rgba(45, 42, 38, 0.06), 0 0 0 1px oklch(0.90 0.012 75), 0 0 24px rgba(212, 116, 60, 0.06)",
                  background: "oklch(0.995 0.005 85)",
                  backdropFilter: "blur(16px)",
                }}>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3 font-heading text-xl"
                      style={{ letterSpacing: "-1px", lineHeight: "1.1" }}>
                      <div className="flex h-8 w-8 items-center justify-center rounded-md"
                        style={{
                          background: "oklch(0.68 0.155 52 / 0.12)",
                          boxShadow: "0 0 0 1px oklch(0.68 0.155 52 / 0.15)",
                        }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 3V13M3 8H13" stroke="oklch(0.68 0.155 52)" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </div>
                      Add API Key
                    </CardTitle>
                    {savedKeys.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false);
                          setSelectedProvider("");
                          setApiKey("");
                          setSelectedModel("");
                          setValidationStatus({ state: "idle" });
                        }}
                        className="text-muted-foreground transition-colors duration-200 rounded-md p-1.5"
                        onMouseEnter={(e) => { e.currentTarget.style.color = "oklch(0.30 0.015 65)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = ""; }}
                        aria-label="Cancel"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1" style={{ lineHeight: "1.55" }}>
                    Your key is encrypted with AES-256-GCM and never exposed to the client.
                  </p>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* -- Provider selector -- */}
                  <div className="space-y-2">
                    <Label htmlFor="provider" className="text-sm font-medium">LLM Provider</Label>
                    <Select value={selectedProvider} onValueChange={(v) => { if (v) setSelectedProvider(v); }}>
                      <SelectTrigger id="provider" className="text-base h-11"
                        style={{
                          background: "oklch(0.97 0.008 85)",
                          boxShadow: "inset 0 1px 2px rgba(45, 42, 38, 0.04), 0 0 0 1px oklch(0.90 0.012 75)",
                        }}>
                        <SelectValue placeholder="Choose your AI provider" />
                      </SelectTrigger>
                      <SelectContent className="min-w-[320px]"
                        style={{
                          background: "oklch(0.995 0.005 85)",
                          boxShadow: "0 0 0 1px oklch(0.90 0.012 75), 0 8px 24px rgba(45, 42, 38, 0.14)",
                        }}>
                        {PROVIDERS.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="cursor-pointer py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-sm">{p.name}</span>
                              <span className="text-xs text-muted-foreground leading-snug">{p.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* -- API key input -- */}
                  {provider && (
                    <div className="space-y-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                      <Label htmlFor="api-key" className="text-sm font-medium">API Key</Label>
                      <div className="relative">
                        <Input
                          id="api-key"
                          type={showKey ? "text" : "password"}
                          value={apiKey}
                          onChange={(e) => {
                            setApiKey(e.target.value);
                            if (validationStatus.state !== "idle") setValidationStatus({ state: "idle" });
                          }}
                          placeholder={provider.placeholder}
                          className="pr-12 text-base font-mono h-11"
                          style={{
                            background: "oklch(0.97 0.008 85)",
                            boxShadow: "inset 0 1px 2px rgba(45, 42, 38, 0.04), 0 0 0 1px oklch(0.90 0.012 75)",
                          }}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors duration-200"
                          style={{ lineHeight: 0 }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.30 0.015 65)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "")}
                          aria-label={showKey ? "Hide API key" : "Show API key"}
                        >
                          {showKey ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Starts with <code className="rounded px-1.5 py-0.5 text-xs font-mono"
                          style={{ background: "oklch(0.95 0.015 75)", border: "1px solid oklch(0.90 0.012 75)" }}>
                          {provider.prefix}
                        </code>
                      </p>
                    </div>
                  )}

                  {/* -- Model selector -- */}
                  {provider && (
                    <div className="space-y-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-200" style={{ animationDelay: "50ms" }}>
                      <Label htmlFor="model" className="text-sm font-medium">
                        Preferred Model
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Select value={selectedModel} onValueChange={(v) => { if (v) setSelectedModel(v); }}>
                        <SelectTrigger id="model" className="text-base h-11"
                          style={{
                            background: "oklch(0.97 0.008 85)",
                            boxShadow: "inset 0 1px 2px rgba(45, 42, 38, 0.04), 0 0 0 1px oklch(0.90 0.012 75)",
                          }}>
                          <SelectValue placeholder="Auto-detect best model" />
                        </SelectTrigger>
                        <SelectContent className="min-w-[320px]"
                          style={{
                            background: "oklch(0.995 0.005 85)",
                            boxShadow: "0 0 0 1px oklch(0.90 0.012 75), 0 8px 24px rgba(45, 42, 38, 0.14)",
                          }}>
                          {provider.models.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="cursor-pointer py-2">
                              <div className="flex items-center justify-between gap-4 w-full">
                                <span className="font-medium text-sm">{m.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">${m.inputCostPer1k}/1K in</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Separator style={{ background: "oklch(0.90 0.012 75)" }} />

                  {/* -- Status indicator -- */}
                  {renderStatusIndicator()}

                  {/* -- Save button -- */}
                  <Button
                    onClick={handleSaveAndValidate}
                    disabled={!selectedProvider || !apiKey.trim() || validationStatus.state === "validating"}
                    className="w-full h-11 text-base font-medium transition-all duration-200"
                    style={{
                      borderRadius: "9999px",
                      background: !selectedProvider || !apiKey.trim() ? "oklch(0.92 0.015 75)" : "oklch(0.62 0.155 52)",
                      color: !selectedProvider || !apiKey.trim() ? "oklch(0.60 0.02 65)" : "oklch(0.99 0.005 85)",
                      boxShadow: selectedProvider && apiKey.trim()
                        ? "0 0 20px rgba(212, 116, 60, 0.15), 0 0 0 1px rgba(212, 116, 60, 0.2)"
                        : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedProvider && apiKey.trim()) {
                        e.currentTarget.style.boxShadow = "0 0 30px rgba(212, 116, 60, 0.25), 0 0 0 1px rgba(212, 116, 60, 0.3)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedProvider && apiKey.trim()) {
                        e.currentTarget.style.boxShadow = "0 0 20px rgba(212, 116, 60, 0.15), 0 0 0 1px rgba(212, 116, 60, 0.2)";
                      }
                    }}
                  >
                    {validationStatus.state === "validating" ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full"
                          style={{ border: "2px solid transparent", borderTopColor: "currentColor", borderRightColor: "currentColor", opacity: 0.6 }} />
                        Validating...
                      </span>
                    ) : (
                      "Save & Validate"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </BlurFade>
          )}
          </div>{/* /trial grey-out wrapper */}

          {/* ---- Forward navigation CTA (shown when any key is saved) ---- */}
          {savedKeys.length > 0 && !showAddForm && (
            <BlurFade delay={0.15}>
              <Card className="overflow-hidden"
                style={{
                  boxShadow: "0 1px 3px rgba(61, 181, 166, 0.08), 0 0 0 1px oklch(0.70 0.12 178 / 0.25), 0 0 24px oklch(0.70 0.12 178 / 0.08)",
                  background: "oklch(0.70 0.12 178 / 0.06)",
                  backdropFilter: "blur(16px)",
                }}>
                <CardContent className="flex items-center justify-between p-5">
                  <div className="space-y-1">
                    <h3 className="font-heading text-lg font-semibold"
                      style={{ color: "oklch(0.72 0.12 178)", letterSpacing: "-0.5px" }}>
                      Ready to discover market gaps
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Your API key is active. Start your first Scout report now.
                    </p>
                  </div>
                  <Link
                    href="/scout"
                    className={buttonVariants({ variant: "default", size: "lg" })}
                    style={{
                      borderRadius: "9999px",
                      background: "oklch(0.72 0.12 178)",
                      color: "oklch(0.14 0.008 65)",
                      boxShadow: "0 0 20px oklch(0.72 0.12 178 / 0.2)",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Start Scout
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ml-1.5">
                      <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </CardContent>
              </Card>
            </BlurFade>
          )}
        </div>

        {/* ================================================================
            RIGHT COLUMN: Cost Estimates & Info
            ================================================================ */}
        <div className="lg:col-span-2 space-y-6">
          {/* -- Cost estimate table -- */}
          <Card style={{
            boxShadow: "0 1px 3px rgba(45, 42, 38, 0.06), 0 0 0 1px oklch(0.90 0.012 75)",
            background: "oklch(0.995 0.005 85)",
            backdropFilter: "blur(16px)",
          }}>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg" style={{ letterSpacing: "-0.8px", lineHeight: "1.1" }}>
                Estimated API Costs
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1" style={{ lineHeight: "1.55" }}>
                Per-run cost estimates based on typical usage.
              </p>
            </CardHeader>
            <CardContent>
              {!activeProvider ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Select a provider to see cost estimates.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Scout */}
                  <div className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{ background: "oklch(0.72 0.12 178 / 0.06)", boxShadow: "0 0 0 1px oklch(0.72 0.12 178 / 0.1)" }}>
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-2 rounded-full" style={{ background: "oklch(0.72 0.12 178)" }} />
                      <span className="text-sm font-medium">Scout</span>
                    </div>
                    <span className="text-sm font-mono" style={{ color: "oklch(0.72 0.12 178)" }}>
                      {activeProvider.scoutEstimate}
                    </span>
                  </div>

                  {/* Forge */}
                  <div className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{ background: "oklch(0.68 0.155 52 / 0.06)", boxShadow: "0 0 0 1px oklch(0.68 0.155 52 / 0.1)" }}>
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-2 rounded-full" style={{ background: "oklch(0.68 0.155 52)" }} />
                      <span className="text-sm font-medium">Forge</span>
                    </div>
                    <span className="text-sm font-mono" style={{ color: "oklch(0.68 0.155 52)" }}>
                      {activeProvider.forgeEstimate}
                    </span>
                  </div>

                  {/* Prove */}
                  <div className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{ background: "oklch(0.84 0.145 85 / 0.06)", boxShadow: "0 0 0 1px oklch(0.84 0.145 85 / 0.1)" }}>
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-2 rounded-full" style={{ background: "oklch(0.84 0.145 85)" }} />
                      <span className="text-sm font-medium">Prove</span>
                    </div>
                    <span className="text-sm font-mono" style={{ color: "oklch(0.84 0.145 85)" }}>
                      {activeProvider.proveEstimate}
                    </span>
                  </div>

                  <Separator className="my-2" style={{ background: "oklch(0.90 0.012 75)" }} />

                  {/* Full pipeline total */}
                  <div className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{ background: "oklch(0.95 0.012 85)", boxShadow: "0 0 0 1px oklch(0.90 0.012 75)" }}>
                    <span className="text-sm font-semibold">Full Pipeline</span>
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {(() => {
                        const parseRange = (s: string) => {
                          const nums = s.match(/[\d.]+/g);
                          return nums ? nums.map(Number) : [0, 0];
                        };
                        const [sLow, sHigh] = parseRange(activeProvider.scoutEstimate);
                        const [fLow, fHigh] = parseRange(activeProvider.forgeEstimate);
                        const [pLow, pHigh] = parseRange(activeProvider.proveEstimate);
                        const low = (sLow + fLow + pLow).toFixed(2);
                        const high = (sHigh + fHigh + pHigh).toFixed(2);
                        return `$${low} - $${high}`;
                      })()}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* -- Model pricing details -- */}
          {activeProvider && activeProvider.models.length > 0 && (
            <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
              style={{
                boxShadow: "0 1px 3px rgba(45, 42, 38, 0.06), 0 0 0 1px oklch(0.90 0.012 75)",
                background: "oklch(0.995 0.005 85)",
                backdropFilter: "blur(16px)",
              }}>
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-lg" style={{ letterSpacing: "-0.8px", lineHeight: "1.1" }}>
                  Model Pricing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="grid grid-cols-3 gap-2 px-2 pb-2">
                    <span className="text-xs text-muted-foreground font-medium">Model</span>
                    <span className="text-xs text-muted-foreground font-medium text-right">Input</span>
                    <span className="text-xs text-muted-foreground font-medium text-right">Output</span>
                  </div>
                  {activeProvider.models.map((m) => (
                    <div key={m.id} className="grid grid-cols-3 gap-2 rounded-md px-2 py-2 transition-colors duration-150"
                      style={{ cursor: "default" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(0.96 0.012 85)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <span className="text-sm font-medium truncate">{m.name}</span>
                      <span className="text-xs font-mono text-muted-foreground text-right self-center">${m.inputCostPer1k}/1K</span>
                      <span className="text-xs font-mono text-muted-foreground text-right self-center">${m.outputCostPer1k}/1K</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* -- Security info card -- */}
          <Card style={{
            boxShadow: "0 1px 2px rgba(45, 42, 38, 0.04), 0 0 0 1px oklch(0.92 0.012 75)",
            background: "oklch(0.97 0.008 85)",
          }}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1L3 4V7.5C3 11.09 5.14 14.41 8 15.5C10.86 14.41 13 11.09 13 7.5V4L8 1Z"
                    stroke="oklch(0.70 0.12 178)" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M6 8L7.5 9.5L10 6.5" stroke="oklch(0.65 0.16 155)"
                    strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h4 className="text-sm font-semibold">How we protect your keys</h4>
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground" style={{ lineHeight: "1.55" }}>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full flex-shrink-0" style={{ background: "oklch(0.70 0.12 178)" }} />
                  AES-256-GCM encryption at rest
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full flex-shrink-0" style={{ background: "oklch(0.70 0.12 178)" }} />
                  Key decrypted server-side only during API calls
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full flex-shrink-0" style={{ background: "oklch(0.70 0.12 178)" }} />
                  Never exposed to browser or logs
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full flex-shrink-0" style={{ background: "oklch(0.70 0.12 178)" }} />
                  You can rotate or delete your key at any time
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
