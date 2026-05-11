"use client";

/**
 * /lab/debate-room/new — Setup screen for a multi-LLM Prove debate.
 *
 * 6 personas (Proposer / Challenger / Analyst / Reviewer / Defender /
 * Strategist) × model dropdown. User picks any model per persona (can
 * mix providers freely OR use the same model for all 6 — that's just a
 * normal Prove with the lab persistence path). Strict BYOK: the page
 * fetches the user's saved API keys at mount and disables models whose
 * provider has no key, with an inline "Add key →" hint.
 *
 * On Start: POST /api/lab/debate-room/start → server resolves all keys,
 * inserts lab_sessions row, dispatches engine. Page redirects to
 * /lab/debate-room?session_id=<new> for live mode.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ALL_MODELS, PROVIDER_LABELS, type ProviderId, type ModelEntry,
  estimatePersonaCostUsd,
} from "@/lib/llm-models";

const PERSONAS = ["proposer", "challenger", "analyst", "reviewer", "defender", "strategist"] as const;
type Persona = typeof PERSONAS[number];

const PERSONA_LABELS: Record<Persona, { name: string; tagline: string; emoji: string }> = {
  proposer:   { name: "Proposer",   tagline: "Pitches the idea, defends the wedge",                  emoji: "💡" },
  challenger: { name: "Challenger", tagline: "Hardest skeptic — attacks viability + market",         emoji: "🗡️" },
  analyst:    { name: "Analyst",    tagline: "Pressure-tests unit economics + lean feasibility",     emoji: "📊" },
  reviewer:   { name: "Reviewer",   tagline: "Fact-checks every claim, attacks load-bearing assumptions", emoji: "🔍" },
  defender:   { name: "Defender",   tagline: "Steel-mans the idea after Challenger lands hits",      emoji: "🛡️" },
  strategist: { name: "Strategist", tagline: "Synthesizes verdict + execution plan or kill brief",   emoji: "🧭" },
};

const IDEA_MAX_LENGTH = 10000;

// Default config: prefer Claude Sonnet 4.6 if user has anthropic key,
// then GPT-5.4, then Gemini 2.5 Pro, then MiniMax-M2.7. Avoids picking
// expensive frontier models as default.
function pickDefaultModel(availableProviders: Set<ProviderId>): string {
  const preferences = ["claude-sonnet-4-6", "gpt-5.4", "gemini-2.5-pro", "MiniMax-M2.7"];
  for (const id of preferences) {
    const m = ALL_MODELS.find(x => x.id === id);
    if (m && availableProviders.has(m.provider)) return id;
  }
  // Last-resort: any model whose provider we have a key for
  const fallback = ALL_MODELS.find(m => availableProviders.has(m.provider));
  return fallback?.id ?? "claude-sonnet-4-6";
}

export default function LabDebateRoomNewPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [savedProviders, setSavedProviders] = useState<Set<ProviderId>>(new Set());
  const [keysLoading, setKeysLoading] = useState(true);
  const [idea, setIdea] = useState("");
  const [personaModels, setPersonaModels] = useState<Record<Persona, string>>({
    proposer: "", challenger: "", analyst: "", reviewer: "", defender: "", strategist: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user's saved API keys on mount → know which providers are available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?next=/lab/debate-room/new");
        return;
      }
      const { data: keys } = await supabase
        .from("api_keys").select("provider").eq("user_id", user.id);
      if (cancelled) return;
      const providers = new Set<ProviderId>(
        (keys ?? [])
          .map((k: { provider: string }) => k.provider as ProviderId)
          .filter((p: ProviderId) => (["anthropic", "openai", "google", "minimax"] as const).includes(p)),
      );
      setSavedProviders(providers);
      // Initialize persona defaults
      const defaultModel = pickDefaultModel(providers);
      setPersonaModels({
        proposer: defaultModel, challenger: defaultModel, analyst: defaultModel,
        reviewer: defaultModel, defender: defaultModel, strategist: defaultModel,
      });
      setKeysLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, router]);

  // Group models by provider for the Select dropdown rendering
  const modelsByProvider = useMemo(() => {
    const grouped: Record<ProviderId, ModelEntry[]> = {
      anthropic: [], openai: [], google: [], minimax: [],
    };
    for (const m of ALL_MODELS) grouped[m.provider].push(m);
    return grouped;
  }, []);

  // Total estimated cost = sum across personas
  const totalCost = useMemo(
    () => PERSONAS.reduce((sum, p) => sum + estimatePersonaCostUsd(personaModels[p] || ""), 0),
    [personaModels],
  );

  // Which persona-provider pairs are missing keys (used for warning + disable)
  const missingByPersona = useMemo(() => {
    const out: { persona: Persona; provider: ProviderId; model: string }[] = [];
    for (const persona of PERSONAS) {
      const modelId = personaModels[persona];
      if (!modelId) continue;
      const m = ALL_MODELS.find(x => x.id === modelId);
      if (m && !savedProviders.has(m.provider)) {
        out.push({ persona, provider: m.provider, model: m.name });
      }
    }
    return out;
  }, [personaModels, savedProviders]);

  const ideaTooLong = idea.length > IDEA_MAX_LENGTH;
  const ideaTooShort = idea.trim().length < 10;
  const noKeys = savedProviders.size === 0;
  const canStart = !ideaTooLong && !ideaTooShort && !noKeys && missingByPersona.length === 0 && !submitting;

  const handleStart = async () => {
    if (!canStart) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/lab/debate-room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, persona_models: personaModels }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Failed to start (HTTP ${resp.status})`);
      }
      const { id } = await resp.json();
      router.push(`/lab/debate-room/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  };

  if (keysLoading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
        <div className="text-sm" style={{ color: "oklch(0.50 0.02 65)" }}>Loading your saved API keys…</div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 sm:py-16" style={{ color: "oklch(0.24 0.012 65)" }}>
      <header className="mb-10">
        <h1 className="font-heading text-4xl font-bold tracking-tight" style={{ letterSpacing: "-1.5px" }}>
          Mixed-LLM Debate Lab
        </h1>
        <p className="mt-3 text-base" style={{ color: "oklch(0.50 0.02 65)", lineHeight: 1.6 }}>
          Pick a different LLM for each of the 6 personas — or use the same model for all (that's just a normal Prove). All 6 reason on the same idea but argue from different model perspectives. Free for testing; runs go into <code style={{ background: "oklch(0.94 0.008 75)", padding: "1px 6px", borderRadius: 4 }}>lab_sessions</code>, separate from your production Prove dataset.
        </p>
      </header>

      {/* No-keys empty state */}
      {noKeys && (
        <Card className="mb-8" style={{ borderRadius: 8, boxShadow: "0 0 0 1px oklch(0.55 0.2 25 / 25%)" }}>
          <CardContent className="py-6 text-center">
            <div className="text-base font-semibold mb-2" style={{ color: "oklch(0.45 0.18 25)" }}>
              No API keys configured
            </div>
            <p className="text-sm mb-4" style={{ color: "oklch(0.50 0.02 65)" }}>
              Add at least one provider key in Settings before running a multi-LLM debate.
            </p>
            <Link href="/settings">
              <Button variant="outline" style={{ borderRadius: 9999 }}>
                Open Settings →
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Idea input */}
      <section className="mb-8">
        <label className="block text-sm font-semibold mb-2" style={{ color: "oklch(0.30 0.015 65)" }}>
          Your idea
        </label>
        <textarea
          value={idea}
          onChange={e => setIdea(e.target.value)}
          placeholder="An async-first project tracker for distributed dev teams that…"
          rows={6}
          className="w-full text-sm rounded-[6px] px-4 py-2.5 resize-y transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[oklch(0.70_0.12_178/40%)]"
          style={{
            background: "oklch(0.96 0.008 80)",
            color: "oklch(0.24 0.012 65)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.06)",
            lineHeight: 1.55,
          }}
        />
        <div className="flex items-center justify-between mt-1.5 text-xs" style={{ color: "oklch(0.55 0.02 65)" }}>
          <span>
            {ideaTooShort && idea.length > 0
              ? <span style={{ color: "oklch(0.60 0.08 52)" }}>Too short — add a full sentence so the agents have something concrete to debate.</span>
              : null}
          </span>
          <span style={{
            color: ideaTooLong ? "oklch(0.55 0.2 25)" : "oklch(0.55 0.02 65)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {idea.length.toLocaleString()} / {IDEA_MAX_LENGTH.toLocaleString()}
          </span>
        </div>
        {ideaTooLong && (
          <div className="text-xs mt-2 px-3 py-2 rounded-[6px] flex items-start gap-2" style={{
            background: "oklch(0.55 0.2 25 / 8%)",
            color: "oklch(0.45 0.18 25)",
            border: "1px solid oklch(0.55 0.2 25 / 25%)",
          }}>
            <span aria-hidden="true">⚠️</span>
            <span>
              Your idea is <strong>{(idea.length - IDEA_MAX_LENGTH).toLocaleString()}</strong> characters over the {IDEA_MAX_LENGTH.toLocaleString()}-char limit. Trim before submitting.
            </span>
          </div>
        )}
      </section>

      {/* Persona × model picker */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: "oklch(0.50 0.02 65)" }}>
          Cast your debate
        </h2>
        <div className="space-y-2">
          {PERSONAS.map(persona => {
            const meta = PERSONA_LABELS[persona];
            const modelId = personaModels[persona];
            const model = ALL_MODELS.find(m => m.id === modelId);
            const missing = model && !savedProviders.has(model.provider);
            return (
              <Card key={persona} style={{
                borderRadius: 8,
                boxShadow: missing ? "0 0 0 1px oklch(0.55 0.2 25 / 30%)" : "0 0 0 1px oklch(0.90 0.012 75)",
                background: "oklch(0.99 0.005 85)",
              }}>
                <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-[180px] flex-shrink-0">
                    <span className="text-xl" aria-hidden="true">{meta.emoji}</span>
                    <div>
                      <div className="text-sm font-semibold">{meta.name}</div>
                      <div className="text-[11px]" style={{ color: "oklch(0.55 0.02 65)" }}>{meta.tagline}</div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <Select
                      value={modelId}
                      onValueChange={v => v && setPersonaModels(prev => ({ ...prev, [persona]: v }))}
                    >
                      <SelectTrigger className="w-full" style={{ borderRadius: 6 }}>
                        <SelectValue placeholder="Pick a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(modelsByProvider) as ProviderId[]).map(prov => {
                          const hasKey = savedProviders.has(prov);
                          return (
                            <SelectGroup key={prov}>
                              <SelectLabel className="text-[11px] uppercase tracking-wider">
                                {PROVIDER_LABELS[prov]} {hasKey ? "" : "(no key)"}
                              </SelectLabel>
                              {modelsByProvider[prov].map(m => (
                                <SelectItem key={m.id} value={m.id} disabled={!hasKey}>
                                  <span className="flex items-center gap-2">
                                    <span>{m.name}</span>
                                    <span className="text-[10px]" style={{ color: "oklch(0.55 0.02 65)" }}>
                                      ${(m.inputCostPer1k * 1000).toFixed(2)}/M in
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {missing && (
                    <Link
                      href="/settings"
                      className="text-xs underline whitespace-nowrap"
                      style={{ color: "oklch(0.55 0.2 25)" }}
                    >
                      Add {PROVIDER_LABELS[model!.provider]} key →
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Cost + Start */}
      <section className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider" style={{ color: "oklch(0.55 0.02 65)" }}>
            Estimated total cost
          </div>
          <div className="text-2xl font-bold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
            ~${totalCost.toFixed(2)}
          </div>
          <div className="text-[11px]" style={{ color: "oklch(0.55 0.02 65)" }}>
            sum of all 6 personas at typical token usage. Real cost varies with idea complexity.
          </div>
        </div>
        <Button
          onClick={handleStart}
          disabled={!canStart}
          size="lg"
          className="px-8 py-3 text-base font-semibold transition-all duration-200 disabled:opacity-40"
          style={{
            borderRadius: 9999,
            background: canStart ? "oklch(0.65 0.18 320)" : "oklch(0.90 0.010 75)",
            color: canStart ? "oklch(0.99 0.005 85)" : "oklch(0.60 0.02 65)",
            boxShadow: canStart ? "0 4px 16px oklch(0.65 0.18 320 / 30%)" : "none",
          }}
        >
          {submitting ? "Starting…" : "Start Mixed-LLM Debate →"}
        </Button>
      </section>

      {missingByPersona.length > 0 && (
        <div className="mt-4 text-xs px-3 py-2 rounded-[6px] flex items-start gap-2" style={{
          background: "oklch(0.55 0.2 25 / 8%)",
          color: "oklch(0.45 0.18 25)",
          border: "1px solid oklch(0.55 0.2 25 / 25%)",
        }}>
          <span aria-hidden="true">⚠️</span>
          <span>
            {missingByPersona.length} persona(s) need keys you haven't saved yet:
            {" "}
            {missingByPersona.map(m => `${PERSONA_LABELS[m.persona].name} → ${PROVIDER_LABELS[m.provider]}`).join(", ")}.
            {" "}
            <Link href="/settings" className="underline">Open Settings →</Link>
          </span>
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm px-4 py-3 rounded-[6px]" style={{
          background: "oklch(0.55 0.2 25 / 8%)",
          color: "oklch(0.45 0.18 25)",
          border: "1px solid oklch(0.55 0.2 25 / 25%)",
        }}>
          {error}
        </div>
      )}

      <footer className="mt-12 pt-6 text-xs" style={{ color: "oklch(0.55 0.02 65)", borderTop: "1px solid oklch(0.90 0.012 75)" }}>
        Sub-agents (Trend Scout, Contrarian, Gap Finder, Benchmark Hunter, Evidence Hunter)
        inherit each parent persona's LLM. The full debate runs ~20–60 minutes depending on
        the slowest model. Lab runs are free during testing — they don't consume Prove quota.
      </footer>
    </main>
  );
}
