"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";
import { trackForgeComplete } from "@/lib/events";
import { createClient } from "@/lib/supabase";
import type { ForgeSession } from "@/lib/types";
import { parseSessionConfig, summarizeSessionConfig } from "@/lib/session-config";

// --- Types ---
interface ForgeSessionWithCosts extends ForgeSession {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model: string;
}

interface ForgeIdea {
  rank: number;
  name: string;
  description: string;
  problem: string;
  why_now: string;
  revenue_model: string;
  kill_score: number;
  rice_score: {
    reach: number;
    impact: number;
    confidence: number;
    effort: number;
    total: number;
  };
  key_metrics: string[];
  target_market: string;
  moat: string;
  validation_plan: Array<{ assumption: string; method: string; success_criteria: string }>;
  kill_switch: string[];
  lean_feasibility: "LEAN_FIT" | "STRETCH" | "NOT_LEAN";
  product_form: string;
  product_form_fit: "NATURAL_FIT" | "ADAPTABLE" | "FORCED";
  product_form_reason: string;
  competitive_landscape: string;
  // Screening metadata (attached to first idea only)
  _screening?: {
    kill_votes: Array<{ agent: string; killed: string; reason: string }>;
    kill_result: string | null;
    kill_vote_counts: Record<string, number>;
    rice_scores: Array<{ agent: string; idea_a: number; idea_b: number }>;
    rice_idea_a: string;
    rice_idea_b: string;
    rice_total_a: number;
    rice_total_b: number;
    tiebreaker_level: string;
    winner: string;
  };
  _sources?: string[];
}

// --- Ember shimmer skeleton ---
function ReportSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-[8px] overflow-hidden p-6 space-y-4" style={{
          background: "oklch(0.96 0.008 85)",
          boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.06)",
          animationDelay: `${i * 0.08}s`,
        }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full" style={{
              background: "linear-gradient(90deg, oklch(0.94 0.010 85), oklch(0.28 0.03 52), oklch(0.94 0.010 85))",
              backgroundSize: "200% 100%",
              animation: "ember-shimmer 1.8s ease-in-out infinite",
            }} />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-1/2 rounded-[4px]" style={{
                background: "linear-gradient(90deg, oklch(0.94 0.010 85), oklch(0.28 0.03 52), oklch(0.94 0.010 85))",
                backgroundSize: "200% 100%",
                animation: "ember-shimmer 1.8s ease-in-out infinite 0.1s",
              }} />
              <div className="h-3.5 w-3/4 rounded-[4px]" style={{
                background: "linear-gradient(90deg, oklch(0.94 0.010 85), oklch(0.90 0.025 52), oklch(0.94 0.010 85))",
                backgroundSize: "200% 100%",
                animation: "ember-shimmer 1.8s ease-in-out infinite 0.2s",
              }} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="h-16 rounded-[6px]" style={{
                background: "linear-gradient(90deg, oklch(0.94 0.010 85), oklch(0.90 0.025 52), oklch(0.94 0.010 85))",
                backgroundSize: "200% 100%",
                animation: `ember-shimmer 1.8s ease-in-out infinite ${0.1 * j}s`,
              }} />
            ))}
          </div>
        </div>
      ))}
      <style>{`@keyframes ember-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </div>
  );
}

// --- RICE Score Bar ---
function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.94 0.010 85)" }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// --- Lean Feasibility Badge ---
function LeanBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    LEAN_FIT: { bg: "oklch(0.65 0.16 155 / 12%)", text: "oklch(0.65 0.16 155)", label: "Lean Fit" },
    STRETCH: { bg: "oklch(0.80 0.14 85 / 12%)", text: "oklch(0.80 0.14 85)", label: "Stretch" },
    NOT_LEAN: { bg: "oklch(0.62 0.20 25 / 12%)", text: "oklch(0.62 0.20 25)", label: "Not Lean" },
  };
  const c = config[level] || config.STRETCH;
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}

// --- Product Form Fit Indicator ---
function FormFitDot({ fit }: { fit: string }) {
  const colors: Record<string, string> = {
    NATURAL_FIT: "oklch(0.65 0.16 155)",
    ADAPTABLE: "oklch(0.80 0.14 85)",
    FORCED: "oklch(0.62 0.20 25)",
  };
  const labels: Record<string, string> = {
    NATURAL_FIT: "Natural Fit",
    ADAPTABLE: "Adaptable",
    FORCED: "Forced Fit",
  };
  const color = colors[fit] || colors.ADAPTABLE;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {labels[fit] || fit}
    </span>
  );
}

// --- Idea Card ---
function IdeaCard({ idea, index }: { idea: ForgeIdea; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const rankColors = [
    { bg: "oklch(0.84 0.145 85 / 15%)", text: "oklch(0.84 0.145 85)", glow: "rgba(240, 192, 80, 0.12)" },
    { bg: "oklch(0.68 0.155 52 / 15%)", text: "oklch(0.68 0.155 52)", glow: "rgba(212, 116, 60, 0.10)" },
    { bg: "oklch(0.72 0.12 178 / 15%)", text: "oklch(0.72 0.12 178)", glow: "rgba(61, 181, 166, 0.10)" },
  ];
  const rc = rankColors[index] || rankColors[2];

  return (
    <BlurFade delay={0.1 + index * 0.08} inView>
      <Card className="relative overflow-hidden group transition-all duration-300 hover:translate-y-[-3px]" style={{
        boxShadow: `0 0 0 1px rgba(237, 233, 224, 0.06), 0 0 30px ${rc.glow}`,
        borderRadius: "8px",
        border: "none",
      }}>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all duration-300 group-hover:scale-110" style={{
              background: rc.bg,
              color: rc.text,
              fontFamily: "var(--font-heading)",
            }}>
              #{idea.rank}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <CardTitle className="text-xl truncate" style={{
                  fontFamily: "var(--font-heading)",
                  letterSpacing: "-1px",
                  lineHeight: "1.08",
                }}>
                  {idea.name}
                </CardTitle>
                {idea.lean_feasibility && <LeanBadge level={idea.lean_feasibility} />}
              </div>
              <div className="text-sm" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                {idea.description}
              </div>
              {/* Product form + fit */}
              {idea.product_form && (
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{
                    background: "oklch(0.94 0.010 85)",
                    color: "oklch(0.48 0.02 65)",
                  }}>
                    {idea.product_form}
                  </span>
                  {idea.product_form_fit && <FormFitDot fit={idea.product_form_fit} />}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Score Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-[6px]" style={{
              background: "oklch(0.94 0.010 85)",
              boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.04)",
            }}>
              <div className="text-xs mb-1" style={{ color: "oklch(0.48 0.02 65)" }}>Kill Score</div>
              <div className="text-2xl font-bold" style={{
                fontFamily: "var(--font-heading)",
                color: idea.kill_score >= 7 ? "oklch(0.65 0.16 155)" : idea.kill_score >= 4 ? "oklch(0.80 0.14 85)" : "oklch(0.62 0.20 25)",
                letterSpacing: "-1px",
              }}>
                {idea.kill_score}<span className="text-sm font-normal" style={{ color: "oklch(0.48 0.02 65)" }}>/10</span>
              </div>
            </div>
            <div className="p-3 rounded-[6px]" style={{
              background: "oklch(0.94 0.010 85)",
              boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.04)",
            }}>
              <div className="text-xs mb-1" style={{ color: "oklch(0.48 0.02 65)" }}>RICE Total</div>
              <div className="text-2xl font-bold" style={{
                fontFamily: "var(--font-heading)",
                color: "oklch(0.68 0.155 52)",
                letterSpacing: "-1px",
              }}>
                {idea.rice_score.total}
              </div>
            </div>
          </div>

          {/* RICE Breakdown */}
          <div className="p-3 rounded-[6px] space-y-3" style={{
            background: "oklch(0.94 0.010 85)",
            boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.04)",
          }}>
            <div className="text-xs font-medium mb-2" style={{ color: "oklch(0.45 0.02 65)" }}>RICE Breakdown</div>
            <ScoreBar label="Reach" value={idea.rice_score.reach} max={10} color="oklch(0.72 0.12 178)" />
            <ScoreBar label="Impact" value={idea.rice_score.impact} max={10} color="oklch(0.68 0.155 52)" />
            <ScoreBar label="Confidence" value={idea.rice_score.confidence} max={10} color="oklch(0.84 0.145 85)" />
            <ScoreBar label="Effort" value={idea.rice_score.effort} max={10} color="oklch(0.60 0.02 75)" />
          </div>

          {/* Problem + Why Now */}
          {(idea.problem || idea.why_now) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {idea.problem && (
                <div className="p-3 rounded-[6px]" style={{ background: "oklch(0.94 0.010 85)", boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.04)" }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="oklch(0.62 0.20 25)" strokeWidth="1.2"/><path d="M6 3.5v3M6 8.5v0" stroke="oklch(0.62 0.20 25)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    <span className="text-xs font-medium" style={{ color: "oklch(0.48 0.02 65)" }}>Problem</span>
                  </div>
                  <div className="text-sm" style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.55" }}>{idea.problem}</div>
                </div>
              )}
              {idea.why_now && (
                <div className="p-3 rounded-[6px]" style={{ background: "oklch(0.94 0.010 85)", boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.04)" }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="oklch(0.72 0.12 178)" strokeWidth="1.2"/><path d="M6 3v3.5l2.5 1.5" stroke="oklch(0.72 0.12 178)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span className="text-xs font-medium" style={{ color: "oklch(0.48 0.02 65)" }}>Why Now</span>
                  </div>
                  <div className="text-sm" style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.55" }}>{idea.why_now}</div>
                </div>
              )}
            </div>
          )}

          {/* Revenue Model */}
          {idea.revenue_model && (
            <div className="p-3 rounded-[6px]" style={{ background: "oklch(0.94 0.010 85)", boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.04)" }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M3.5 3.5C3.5 2.67 4.62 2 6 2s2.5.67 2.5 1.5S7.38 5 6 5 3.5 5.67 3.5 6.5 4.62 8 6 8s2.5-.67 2.5-1.5" stroke="oklch(0.65 0.16 155)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <span className="text-xs font-medium" style={{ color: "oklch(0.48 0.02 65)" }}>Revenue Model</span>
              </div>
              <div className="text-sm" style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.55" }}>{idea.revenue_model}</div>
            </div>
          )}

          {/* Key Metrics */}
          {idea.key_metrics?.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-2" style={{ color: "oklch(0.45 0.02 65)" }}>Key Metrics</div>
              <div className="flex flex-wrap gap-1.5">
                {idea.key_metrics.map((metric) => (
                  <Badge key={metric} variant="secondary" style={{
                    background: "oklch(0.94 0.010 85)",
                    color: "oklch(0.40 0.02 65)",
                    borderRadius: "4px",
                    fontSize: "11px",
                  }}>
                    {metric}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Target & Moat */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs mb-1" style={{ color: "oklch(0.48 0.02 65)" }}>Target Market</div>
              <div style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.55" }}>{idea.target_market}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "oklch(0.48 0.02 65)" }}>Competitive Moat</div>
              <div style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.55" }}>{idea.moat}</div>
            </div>
          </div>

          {/* Competitive Landscape */}
          {idea.competitive_landscape && (
            <div className="p-3 rounded-[6px]" style={{ background: "oklch(0.94 0.010 85)", boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.04)" }}>
              <div className="text-xs font-medium mb-1.5" style={{ color: "oklch(0.48 0.02 65)" }}>Competitive Landscape</div>
              <div className="text-sm" style={{ color: "oklch(0.35 0.015 65)", lineHeight: "1.55" }}>{idea.competitive_landscape}</div>
            </div>
          )}

          {/* Expandable section: Validation Plan + Kill Switch */}
          {(idea.validation_plan?.length > 0 || idea.kill_switch?.length > 0) && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs font-medium transition-colors duration-200 w-full"
                style={{ color: "oklch(0.68 0.155 52)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "oklch(0.78 0.155 52)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "oklch(0.68 0.155 52)"; }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{
                  transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}>
                  <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Validation Plan & Kill Switch
              </button>

              {expanded && (
                <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  {/* Validation Plan */}
                  {idea.validation_plan?.length > 0 && (
                    <div className="p-3 rounded-[6px] space-y-2.5" style={{
                      background: "oklch(0.94 0.010 85)",
                      boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.04)",
                    }}>
                      <div className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="oklch(0.65 0.16 155)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span className="text-xs font-medium" style={{ color: "oklch(0.48 0.02 65)" }}>Validation Plan</span>
                      </div>
                      {idea.validation_plan.map((step, i) => (
                        <div key={i} className="pl-3" style={{ borderLeft: "2px solid oklch(0.65 0.16 155 / 20%)" }}>
                          <div className="text-xs font-medium mb-0.5" style={{ color: "oklch(0.35 0.015 65)" }}>{step.assumption}</div>
                          <div className="text-[11px]" style={{ color: "oklch(0.45 0.02 65)" }}>
                            <span style={{ color: "oklch(0.48 0.02 65)" }}>Method:</span> {step.method}
                          </div>
                          <div className="text-[11px]" style={{ color: "oklch(0.45 0.02 65)" }}>
                            <span style={{ color: "oklch(0.48 0.02 65)" }}>Success:</span> {step.success_criteria}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Kill Switch */}
                  {idea.kill_switch?.length > 0 && (
                    <div className="p-3 rounded-[6px] space-y-1.5" style={{
                      background: "oklch(0.62 0.20 25 / 4%)",
                      boxShadow: "0 0 0 1px oklch(0.62 0.20 25 / 8%)",
                    }}>
                      <div className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="oklch(0.62 0.20 25)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        <span className="text-xs font-medium" style={{ color: "oklch(0.62 0.20 25)" }}>Kill Switch</span>
                      </div>
                      {idea.kill_switch.map((condition, i) => (
                        <div key={i} className="text-xs pl-5" style={{ color: "oklch(0.45 0.04 25)", lineHeight: "1.55" }}>
                          {condition}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CTA: Forward navigation to /prove */}
          <Link
            href={`/prove?idea=${encodeURIComponent(idea.name)}&from_forge=true`}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[9999px] text-sm font-semibold transition-all duration-300"
            style={{
              background: "oklch(0.84 0.145 85 / 12%)",
              color: "oklch(0.84 0.145 85)",
              boxShadow: "0 0 0 1px oklch(0.84 0.145 85 / 20%)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "oklch(0.84 0.145 85 / 20%)";
              e.currentTarget.style.boxShadow = "0 0 0 1px oklch(0.84 0.145 85 / 40%), 0 0 20px rgba(240, 192, 80, 0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "oklch(0.84 0.145 85 / 12%)";
              e.currentTarget.style.boxShadow = "0 0 0 1px oklch(0.84 0.145 85 / 20%)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L9 5.5L13 7L9 8.5L7 13L5 8.5L1 7L5 5.5L7 1Z" fill="currentColor" />
            </svg>
            Verify This Idea
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </CardContent>
      </Card>
    </BlurFade>
  );
}

// --- Build full markdown (shared by MD + PDF export) ---
function buildForgeMarkdown(ideas: ForgeIdea[]): string {
  const md = ideas.map((idea) => {
    let s = `## #${idea.rank}: ${idea.name}

${idea.description}
`;
    if (idea.problem) s += `\n**Problem:** ${idea.problem}`;
    if (idea.why_now) s += `\n**Why Now:** ${idea.why_now}`;
    s += `
\n**Kill Score:** ${idea.kill_score}/10
**RICE Score:** ${idea.rice_score.total} (R:${idea.rice_score.reach} I:${idea.rice_score.impact} C:${idea.rice_score.confidence} E:${idea.rice_score.effort})
`;
    if (idea.lean_feasibility) s += `**Lean Feasibility:** ${idea.lean_feasibility}`;
    if (idea.product_form) s += `\n**Product Form:** ${idea.product_form}${idea.product_form_fit ? ` (${idea.product_form_fit})` : ""}`;
    if (idea.revenue_model) s += `\n**Revenue Model:** ${idea.revenue_model}`;
    s += `\n\n**Target Market:** ${idea.target_market}
**Competitive Moat:** ${idea.moat}`;
    if (idea.competitive_landscape) s += `\n**Competitive Landscape:** ${idea.competitive_landscape}`;
    s += `\n\n**Key Metrics:** ${idea.key_metrics.join(", ")}`;
    if (idea.validation_plan?.length > 0) {
      s += `\n\n### Validation Plan\n${idea.validation_plan.map((v, i) => `${i + 1}. **${v.assumption}**\n   - Method: ${v.method}\n   - Success: ${v.success_criteria}`).join("\n")}`;
    }
    if (idea.kill_switch?.length > 0) {
      s += `\n\n### Kill Switch\n${idea.kill_switch.map(k => `- ${k}`).join("\n")}`;
    }
    s += "\n\n---\n";
    return s;
  }).join("\n");

  const header = `# GapSmith Forge Report\nGenerated: ${new Date().toLocaleDateString()}\n\n---\n\n`;
  return header + md;
}

// --- Simple markdown → HTML for PDF export (no external deps) ---
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseTableCells(line: string): string[] {
  // Strip leading/trailing pipe + whitespace, then split on | (preserve empties)
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  // GFM table separator: | --- | :--- | ---: |
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function simpleMarkdownToHtml(md: string): string {
  // Escape HTML first so user content can't inject tags
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let inList = false;
  let inPara = false;
  const flushPara = () => { if (inPara) { out.push("</p>"); inPara = false; } };
  const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Table detection: header row + separator row + body rows (all start with |)
    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushPara(); flushList();
      const header = parseTableCells(line);
      i += 2; // skip header + separator
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

// --- Print HTML report via Blob URL (reliable style application) ---
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
  // Wait for the popup to fully load styles before invoking print
  if (win.document.readyState === "complete") {
    setTimeout(trigger, 300);
  } else {
    win.addEventListener("load", () => setTimeout(trigger, 300));
    setTimeout(trigger, 1500); // fallback in case load doesn't fire
  }
}

// --- Export Markdown ---
function exportAsMarkdown(ideas: ForgeIdea[]) {
  const blob = new Blob([buildForgeMarkdown(ideas)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gapsmith-forge-report-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Export PDF (browser print) ---
function exportAsPdf(ideas: ForgeIdea[]) {
  const md = buildForgeMarkdown(ideas);
  printHtmlReport(simpleMarkdownToHtml(md), `GapSmith Forge Report — ${new Date().toLocaleDateString()}`, "#b48c3c");
}

// --- Demo data ---
const DEMO_IDEAS: ForgeIdea[] = [
  {
    rank: 1,
    name: "DevScope - AI Code Review Orchestrator",
    description: "An AI-powered platform that orchestrates multiple specialized code review agents, each focusing on security, performance, accessibility, and architecture. Unlike single-model reviewers, it produces a unified consensus report with weighted severity scoring.",
    problem: "Code reviews are bottlenecked by senior engineers. Single-model AI reviewers miss domain-specific issues and produce noisy, low-confidence findings.",
    why_now: "GPT-4o/Claude 3.5 quality + tool-use APIs make multi-agent orchestration viable at <$0.10/review. GitHub Copilot normalized AI-in-dev but hasn't solved review quality.",
    revenue_model: "Freemium SaaS: free for open-source repos, $29/seat/mo for teams. Enterprise tier at $99/seat/mo with custom agent fine-tuning and SOC2 audit logs.",
    kill_score: 8,
    rice_score: { reach: 9, impact: 8, confidence: 7, effort: 6, total: 84 },
    key_metrics: ["Reviews/week", "Bugs caught pre-merge", "Time saved/review", "NPS"],
    target_market: "Engineering teams 10-100 devs at Series A-C startups",
    moat: "Multi-agent consensus model with domain-specific fine-tuning",
    validation_plan: [
      { assumption: "Teams spend >5 hrs/week on code review", method: "Survey 50 eng managers via LinkedIn outreach", success_criteria: "60%+ confirm >5 hrs/week" },
      { assumption: "Multi-agent catches more bugs than single-model", method: "A/B test on 100 real PRs from open-source repos", success_criteria: "30%+ improvement in bug detection rate" },
      { assumption: "Teams will pay $29/seat/mo", method: "Landing page with pricing + waitlist signup", success_criteria: "200+ signups in 4 weeks, 10%+ click 'Buy'" },
    ],
    kill_switch: [
      "If <100 waitlist signups after 4 weeks of promotion -> Pivot to consulting model",
      "If multi-agent shows <10% improvement over single-model -> Kill, moat doesn't exist",
      "If API costs exceed $0.50/review at scale -> Re-evaluate pricing or switch to smaller models",
    ],
    lean_feasibility: "LEAN_FIT",
    product_form: "Web App (SaaS)",
    product_form_fit: "NATURAL_FIT",
    product_form_reason: "Code review is inherently a web workflow integrated with GitHub/GitLab. A SaaS dashboard with GitHub App is the natural delivery mechanism.",
    competitive_landscape: "CodeRabbit ($19/seat/mo, single-model), Sourcery (Python-only), Codacy (rules-based). No multi-agent consensus approach exists in market.",
  },
  {
    rank: 2,
    name: "PainRadar - B2B Pain Point Aggregator",
    description: "Real-time aggregation of customer pain signals from support tickets, G2 reviews, Reddit complaints, and Twitter threads. Uses NLP to cluster pain points by intensity and frequency, surfacing high-value product gaps for SaaS founders.",
    problem: "SaaS founders rely on gut feeling or manual spreadsheet analysis to identify customer pain points. Critical signals are scattered across 10+ channels.",
    why_now: "LLM-powered NLP can now reliably extract sentiment and cluster complaints at scale. G2/Reddit/Twitter APIs are mature and accessible.",
    revenue_model: "SaaS subscription: $49/mo (Starter, 3 sources), $149/mo (Growth, 10 sources + Slack alerts), $399/mo (Enterprise, unlimited + API access).",
    kill_score: 7,
    rice_score: { reach: 8, impact: 7, confidence: 6, effort: 5, total: 67 },
    key_metrics: ["Pain signals/day", "Clusters identified", "Signal-to-noise ratio", "Founder actions taken"],
    target_market: "SaaS founders and product managers at early-stage companies",
    moat: "Proprietary pain intensity scoring algorithm and multi-source data fusion",
    validation_plan: [
      { assumption: "Founders actively search for pain signal tools", method: "SEO keyword research + Reddit/IH post engagement", success_criteria: "1000+ monthly searches for related terms" },
      { assumption: "Aggregated signals are more valuable than single-source", method: "Give 10 founders a manual report vs single-source data", success_criteria: "8/10 prefer aggregated report" },
    ],
    kill_switch: [
      "If <50 waitlist signups in 3 weeks -> Signals aren't painful enough to pay for",
      "If NLP clustering accuracy <70% on real data -> Tech isn't ready, wait 6 months",
    ],
    lean_feasibility: "LEAN_FIT",
    product_form: "Web App (SaaS)",
    product_form_fit: "NATURAL_FIT",
    product_form_reason: "Dashboard-style product for monitoring and exploring pain signal clusters. Real-time alerts via Slack/email integration.",
    competitive_landscape: "Sentisum (enterprise, $10K+/yr), Ideanote (idea management, not pain-focused), manual alternatives (spreadsheets, Notion). No affordable, founder-focused pain aggregator.",
  },
  {
    rank: 3,
    name: "ShipStack - One-Click Infra for Side Projects",
    description: "A curated infrastructure-as-code platform that generates production-grade deploy configs for common side project stacks. Users pick their stack (Next.js + Supabase, Rails + Postgres, etc.) and get CI/CD, monitoring, and cost-optimized hosting in one click.",
    problem: "Indie hackers spend 2-5 days setting up infra for each side project. Most abandon projects during the 'DevOps gap' between code-complete and deployed.",
    why_now: "IaC tools (Pulumi, SST) are mature but still complex. The indie hacker community has 3x'd since 2022. No one has built the 'Vercel for everything beyond Next.js'.",
    revenue_model: "Freemium: free for 1 project, $12/mo for unlimited projects + custom domains, $29/mo for team features + priority support.",
    kill_score: 6,
    rice_score: { reach: 7, impact: 6, confidence: 8, effort: 4, total: 84 },
    key_metrics: ["Deploy time", "Monthly infra cost", "Stack configs generated", "Repeat usage"],
    target_market: "Indie hackers and solo developers shipping side projects",
    moat: "Community-curated stack templates with real cost data and benchmarks",
    validation_plan: [
      { assumption: "Indie hackers find infra setup painful enough to pay", method: "Twitter poll + IH discussion thread", success_criteria: "200+ responses, 40%+ rate infra as top-3 pain" },
      { assumption: "Generated configs work on first deploy 80%+ of the time", method: "Test top 5 stack combos on 10 real projects each", success_criteria: "80%+ first-try success rate" },
    ],
    kill_switch: [
      "If <$12/mo willingness to pay in surveys -> Market is too price-sensitive",
      "If >20 stack combos needed for 80% coverage -> Scope is too broad for lean team",
    ],
    lean_feasibility: "STRETCH",
    product_form: "CLI + Web Dashboard",
    product_form_fit: "NATURAL_FIT",
    product_form_reason: "CLI for generation fits developer workflow. Web dashboard for monitoring deployed projects and managing configs.",
    competitive_landscape: "Vercel (Next.js only), Railway (PaaS, not IaC), Render (simple but limited stacks). No 'pick your stack and get everything' solution.",
  },
];

// --- Main Content ---
function ForgeReportContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id");
  const [session, setSession] = useState<ForgeSessionWithCosts | null>(null);
  const [ideas, setIdeas] = useState<ForgeIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const supabase = createClient();

  useEffect(() => {
    async function loadSession() {
      if (!sessionId) {
        // Demo mode
        setIdeas(DEMO_IDEAS);
        setLoading(false);
        trackForgeComplete({ idea_count: DEMO_IDEAS.length, session_id: "demo" });
        return;
      }

      try {
        const { data } = await supabase
          .from("forge_sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        if (data) {
          const sessionData = data as unknown as ForgeSessionWithCosts;
          setSession(sessionData);
          const topIdeas = (sessionData.top_ideas as ForgeIdea[]) || DEMO_IDEAS;
          setIdeas(topIdeas);
          trackForgeComplete({ idea_count: topIdeas.length, session_id: sessionId });
        } else {
          setIdeas(DEMO_IDEAS);
          trackForgeComplete({ idea_count: DEMO_IDEAS.length, session_id: sessionId });
        }
      } catch {
        setIdeas(DEMO_IDEAS);
        trackForgeComplete({ idea_count: DEMO_IDEAS.length, session_id: sessionId || "fallback" });
      }
      setLoading(false);
    }
    loadSession();
    // eslint-disable-next-line
  }, [sessionId]);

  if (loading) {
    return (
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <ReportSkeleton />
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Card className="text-center" style={{
          boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.06)",
          borderRadius: "8px",
          border: "none",
        }}>
          <CardContent className="flex flex-col items-center py-16">
            <Image
              src="/images/empty-state.webp"
              alt="No ideas generated yet"
              width={240}
              height={240}
              className="mb-6 opacity-70"
            />
            <h2 className="text-2xl font-bold mb-2" style={{
              fontFamily: "var(--font-heading)",
              letterSpacing: "-1.5px",
              lineHeight: "1.08",
              color: "oklch(0.22 0.015 65)",
            }}>
              No Ideas Yet
            </h2>
            <div className="text-sm mb-6" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55", maxWidth: "360px" }}>
              Start a Forge brainstorm session to generate and rank startup ideas using AI Proposer + Defender dynamics.
            </div>
            <Link href="/forge" className={buttonVariants({ size: "lg" })} style={{
              borderRadius: "9999px",
              background: "oklch(0.68 0.155 52)",
              color: "oklch(0.14 0.008 65)",
            }}>
              Start Forging Ideas
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12 overflow-x-hidden">
      {/* Header */}
      <BlurFade delay={0}>
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
                background: "oklch(0.68 0.155 52 / 15%)",
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2L12.5 7.5L18 10L12.5 12.5L10 18L7.5 12.5L2 10L7.5 7.5L10 2Z" fill="oklch(0.68 0.155 52)" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold" style={{
                  fontFamily: "var(--font-heading)",
                  letterSpacing: "-2px",
                  lineHeight: "1.08",
                  color: "oklch(0.22 0.015 65)",
                }}>
                  Forge Report
                </h1>
                <div className="text-sm" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55" }}>
                  Top {ideas.length} ranked ideas from your brainstorm session
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => exportAsMarkdown(ideas)}
                className="transition-all duration-200"
                style={{
                  borderRadius: "9999px",
                  boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.10)",
                  border: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 1px oklch(0.68 0.155 52 / 40%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 1px rgba(237, 233, 224, 0.10)";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mr-2">
                  <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Export Markdown
              </Button>
              <Button
                variant="outline"
                onClick={() => exportAsPdf(ideas)}
                className="transition-all duration-200"
                style={{
                  borderRadius: "9999px",
                  boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.10)",
                  border: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 1px oklch(0.68 0.155 52 / 40%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 1px rgba(237, 233, 224, 0.10)";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mr-2">
                  <path d="M11 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4l-2-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Export PDF
              </Button>
            </div>
          </div>
        </div>
      </BlurFade>

      {/* Summary Stats */}
      <BlurFade delay={0.08}>
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: "Ideas Ranked", value: ideas.length, color: "oklch(0.68 0.155 52)" },
            { label: "Top Kill Score", value: Math.max(...ideas.map(i => i.kill_score)), suffix: "/10", color: "oklch(0.65 0.16 155)" },
            { label: "Avg RICE", value: Math.round(ideas.reduce((s, i) => s + i.rice_score.total, 0) / ideas.length), color: "oklch(0.84 0.145 85)" },
          ].map((stat) => (
            <Card key={stat.label} className="text-center transition-all duration-300 hover:translate-y-[-2px]" style={{
              boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.06)",
              borderRadius: "8px",
              border: "none",
            }}>
              <CardContent className="py-5 px-3">
                <div className="text-2xl sm:text-3xl font-bold" style={{
                  fontFamily: "var(--font-heading)",
                  color: stat.color,
                  letterSpacing: "-1.5px",
                }}>
                  <NumberTicker value={stat.value} />
                  {stat.suffix && <span className="text-sm font-normal" style={{ color: "oklch(0.48 0.02 65)" }}>{stat.suffix}</span>}
                </div>
                <div className="text-xs mt-1" style={{ color: "oklch(0.48 0.02 65)" }}>{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </BlurFade>

      {/* Tabs for view mode */}
      <BlurFade delay={0.16}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList style={{ background: "oklch(0.96 0.008 85)", borderRadius: "8px" }}>
            <TabsTrigger value="overview" style={{ borderRadius: "6px" }}>Overview</TabsTrigger>
            <TabsTrigger value="compare" style={{ borderRadius: "6px" }}>Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="space-y-6">
              {ideas.map((idea, i) => (
                <IdeaCard key={idea.rank} idea={idea} index={i} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="compare" className="mt-6">
            <Card style={{
              boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.06)",
              borderRadius: "8px",
              border: "none",
              overflowX: "auto",
            }}>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid oklch(1 0.01 75 / 6%)" }}>
                      <th className="text-left p-4 font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>Idea</th>
                      <th className="text-center p-4 font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>Kill</th>
                      <th className="text-center p-4 font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>RICE</th>
                      <th className="text-center p-4 font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>Lean</th>
                      <th className="text-center p-4 font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>Form</th>
                      <th className="text-center p-4 font-medium" style={{ color: "oklch(0.45 0.02 65)" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ideas.map((idea, i) => {
                      const rankColors = ["oklch(0.84 0.145 85)", "oklch(0.68 0.155 52)", "oklch(0.72 0.12 178)"];
                      return (
                        <tr key={idea.rank} className="transition-colors duration-200" style={{
                          borderBottom: i < ideas.length - 1 ? "1px solid oklch(1 0.01 75 / 6%)" : "none",
                        }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(0.94 0.010 85)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{
                                background: `${rankColors[i] || rankColors[2]}15`,
                                color: rankColors[i] || rankColors[2],
                              }}>
                                {idea.rank}
                              </span>
                              <div className="min-w-0">
                                <span className="font-medium truncate block max-w-[180px]" style={{ color: "oklch(0.22 0.015 65)" }}>{idea.name}</span>
                                {idea.product_form && (
                                  <span className="text-[10px]" style={{ color: "oklch(0.48 0.02 65)" }}>{idea.product_form}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-center p-4 font-bold" style={{
                            color: idea.kill_score >= 7 ? "oklch(0.65 0.16 155)" : idea.kill_score >= 4 ? "oklch(0.80 0.14 85)" : "oklch(0.62 0.20 25)",
                          }}>{idea.kill_score}<span className="text-[10px] font-normal" style={{ color: "oklch(0.48 0.02 65)" }}>/10</span></td>
                          <td className="text-center p-4">
                            <div className="font-bold" style={{ color: "oklch(0.68 0.155 52)" }}>{idea.rice_score.total}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: "oklch(0.48 0.02 65)" }}>
                              R{idea.rice_score.reach} I{idea.rice_score.impact} C{idea.rice_score.confidence} E{idea.rice_score.effort}
                            </div>
                          </td>
                          <td className="text-center p-4">
                            {idea.lean_feasibility && <LeanBadge level={idea.lean_feasibility} />}
                          </td>
                          <td className="text-center p-4">
                            {idea.product_form_fit && <FormFitDot fit={idea.product_form_fit} />}
                          </td>
                          <td className="text-center p-4">
                            <Link
                              href={`/prove?idea=${encodeURIComponent(idea.name)}&from_forge=true`}
                              className="text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-200"
                              style={{
                                background: "oklch(0.84 0.145 85 / 10%)",
                                color: "oklch(0.84 0.145 85)",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(0.84 0.145 85 / 20%)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "oklch(0.84 0.145 85 / 10%)"; }}
                            >
                              Verify
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </BlurFade>

      {/* Cost / token footer */}
      {session && (session.total_cost_usd > 0 || session.total_input_tokens > 0) && (
        <BlurFade delay={0.22}>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs mt-6 mb-2" style={{ color: "oklch(0.48 0.02 65)" }}>
            <span>Model: {session.model || "---"}</span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span>{(session.total_input_tokens + session.total_output_tokens).toLocaleString()} tokens</span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span>${session.total_cost_usd.toFixed(4)} API cost</span>
            {(() => {
              const summary = summarizeSessionConfig(parseSessionConfig(session.session_config));
              return summary ? (
                <>
                  <span style={{ opacity: 0.3 }}>|</span>
                  <span title="Project context that shaped these ideas — Prove will inherit this when debating one of them" style={{ color: "oklch(0.55 0.12 178)" }}>
                    Generated under: {summary}
                  </span>
                </>
              ) : null;
            })()}
          </div>
        </BlurFade>
      )}

      {/* Screening Process */}
      {ideas[0]?._screening && (
        <BlurFade delay={0.26}>
          <Card className="mt-8" style={{
            boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.06)",
            borderRadius: "8px",
            border: "none",
          }}>
            <CardContent className="p-6">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "oklch(0.68 0.155 52 / 12%)" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v4l2.5 1.5M14 8a6 6 0 11-12 0 6 6 0 0112 0z" stroke="oklch(0.68 0.155 52)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px", color: "oklch(0.22 0.015 65)" }}>
                    Screening Process
                  </h3>
                  <div className="text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>5 AI agents independently evaluated all ideas</div>
                </div>
              </div>

              {/* Kill Vote — Visual */}
              {ideas[0]._screening.kill_votes?.length > 0 && (() => {
                const screening = ideas[0]._screening!;
                const voteCounts = screening.kill_vote_counts || {};
                const allTargets = Object.keys(voteCounts);
                const maxVotes = Math.max(...Object.values(voteCounts), 1);

                return (
                  <div className="mt-5">
                    <div className="text-sm font-medium mb-3" style={{ color: "oklch(0.35 0.015 65)" }}>
                      Kill Vote — Eliminate Weakest
                    </div>

                    {/* Visual vote bars */}
                    <div className="space-y-2 mb-3">
                      {allTargets.map((target) => {
                        const count = voteCounts[target] || 0;
                        const isEliminated = target === screening.kill_result;
                        const pct = (count / 5) * 100;
                        return (
                          <div key={target} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium truncate max-w-[200px]" style={{
                                color: isEliminated ? "oklch(0.62 0.20 25)" : "oklch(0.70 0.02 75)",
                              }}>
                                {target}
                                {isEliminated && (
                                  <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{
                                    background: "oklch(0.62 0.20 25 / 10%)",
                                    color: "oklch(0.62 0.20 25)",
                                  }}>
                                    eliminated
                                  </span>
                                )}
                              </span>
                              <span className="text-xs font-bold" style={{
                                color: isEliminated ? "oklch(0.62 0.20 25)" : "oklch(0.50 0.02 65)",
                              }}>{count}/5</span>
                            </div>
                            <div className="h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.94 0.010 85)" }}>
                              <div
                                className="h-full rounded-full transition-all duration-700 ease-out"
                                style={{
                                  width: `${pct}%`,
                                  background: isEliminated
                                    ? "linear-gradient(90deg, oklch(0.62 0.20 25), oklch(0.55 0.22 25))"
                                    : "oklch(0.80 0.04 75)",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Agent reasoning — collapsible */}
                    <details className="group">
                      <summary className="text-[11px] font-medium cursor-pointer select-none transition-colors" style={{ color: "oklch(0.48 0.02 65)" }}>
                        <span className="group-open:hidden">Show agent reasoning</span>
                        <span className="hidden group-open:inline">Hide agent reasoning</span>
                      </summary>
                      <div className="mt-2 space-y-1.5 pl-1">
                        {screening.kill_votes.map((vote: { agent: string; killed: string; reason: string }, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-[11px]">
                            <span className="shrink-0 font-medium w-[70px] capitalize" style={{ color: "oklch(0.48 0.02 65)" }}>{vote.agent}</span>
                            <span className="shrink-0" style={{ color: "oklch(0.62 0.20 25)" }}>{vote.killed}</span>
                            {vote.reason && <span style={{ color: "oklch(0.48 0.02 65)", lineHeight: "1.5" }}>— {vote.reason.substring(0, 100)}{vote.reason.length > 100 ? "..." : ""}</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })()}

              {/* RICE Scores — Enhanced */}
              {ideas[0]._screening.rice_scores?.length > 0 && (() => {
                const screening = ideas[0]._screening!;
                const maxTotal = Math.max(screening.rice_total_a, screening.rice_total_b, 1);
                const aWins = screening.rice_total_a >= screening.rice_total_b;

                return (
                  <div className="mt-6">
                    <div className="text-sm font-medium mb-3" style={{ color: "oklch(0.35 0.015 65)" }}>
                      RICE Scoring — Rank Remaining
                    </div>

                    {/* Head-to-head comparison bars */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { name: screening.rice_idea_a, total: screening.rice_total_a, isWinner: aWins, color: "oklch(0.68 0.155 52)" },
                        { name: screening.rice_idea_b, total: screening.rice_total_b, isWinner: !aWins, color: "oklch(0.72 0.12 178)" },
                      ].map((idea) => (
                        <div key={idea.name} className="p-3 rounded-[6px] text-center relative" style={{
                          background: "oklch(0.94 0.010 85)",
                          boxShadow: idea.isWinner ? `0 0 0 1.5px ${idea.color}, 0 0 16px ${idea.color}33` : "0 0 0 1px rgba(237, 233, 224, 0.04)",
                        }}>
                          {idea.isWinner && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{
                              background: idea.color,
                              color: "oklch(0.14 0.008 65)",
                            }}>
                              Winner
                            </div>
                          )}
                          <div className="text-xs truncate mb-1 mt-1" style={{ color: "oklch(0.45 0.02 65)" }}>{idea.name}</div>
                          <div className="text-2xl font-bold" style={{
                            fontFamily: "var(--font-heading)",
                            color: idea.color,
                            letterSpacing: "-1px",
                          }}>
                            {idea.total}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Per-agent score table with inline bars */}
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr style={{ borderBottom: "1px solid oklch(0.90 0.010 75)" }}>
                            <th className="text-left py-2 pr-3 font-medium" style={{ color: "oklch(0.48 0.02 65)" }}>Agent</th>
                            <th className="text-right py-2 px-2 font-medium w-[60px]" style={{ color: "oklch(0.62 0.155 52)" }}>
                              <span className="truncate block max-w-[80px]">{screening.rice_idea_a}</span>
                            </th>
                            <th className="py-2 px-1 w-[120px]" />
                            <th className="text-left py-2 px-2 font-medium w-[60px]" style={{ color: "oklch(0.72 0.12 178)" }}>
                              <span className="truncate block max-w-[80px]">{screening.rice_idea_b}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {screening.rice_scores.map((score: { agent: string; idea_a: number; idea_b: number }, i: number) => {
                            const rowMax = Math.max(score.idea_a, score.idea_b, 1);
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid oklch(0.94 0.008 75)" }}>
                                <td className="py-2 pr-3 capitalize" style={{ color: "oklch(0.48 0.02 65)" }}>{score.agent}</td>
                                <td className="text-right py-2 px-2 font-mono font-bold" style={{
                                  color: score.idea_a >= score.idea_b ? "oklch(0.68 0.155 52)" : "oklch(0.50 0.02 65)",
                                }}>{score.idea_a}</td>
                                <td className="py-2 px-1">
                                  <div className="flex items-center gap-0.5 h-3">
                                    <div className="flex-1 flex justify-end">
                                      <div className="h-full rounded-l-sm transition-all duration-500" style={{
                                        width: `${(score.idea_a / rowMax) * 100}%`,
                                        background: score.idea_a >= score.idea_b ? "oklch(0.68 0.155 52)" : "oklch(0.68 0.155 52 / 35%)",
                                      }} />
                                    </div>
                                    <div className="w-px h-full" style={{ background: "oklch(0.85 0.010 75)" }} />
                                    <div className="flex-1">
                                      <div className="h-full rounded-r-sm transition-all duration-500" style={{
                                        width: `${(score.idea_b / rowMax) * 100}%`,
                                        background: score.idea_b >= score.idea_a ? "oklch(0.72 0.12 178)" : "oklch(0.72 0.12 178 / 35%)",
                                      }} />
                                    </div>
                                  </div>
                                </td>
                                <td className="text-left py-2 px-2 font-mono font-bold" style={{
                                  color: score.idea_b >= score.idea_a ? "oklch(0.72 0.12 178)" : "oklch(0.50 0.02 65)",
                                }}>{score.idea_b}</td>
                              </tr>
                            );
                          })}
                          <tr style={{ borderTop: "2px solid oklch(0.85 0.010 75)" }}>
                            <td className="py-2 pr-3 font-bold" style={{ color: "oklch(0.35 0.015 65)" }}>Total</td>
                            <td className="text-right py-2 px-2 font-mono font-bold" style={{
                              color: aWins ? "oklch(0.68 0.155 52)" : "oklch(0.50 0.02 65)",
                            }}>{screening.rice_total_a}</td>
                            <td />
                            <td className="text-left py-2 px-2 font-mono font-bold" style={{
                              color: !aWins ? "oklch(0.72 0.12 178)" : "oklch(0.50 0.02 65)",
                            }}>{screening.rice_total_b}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Tiebreaker level */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{
                        background: "oklch(0.68 0.155 52 / 10%)",
                        color: "oklch(0.68 0.155 52)",
                      }}>
                        {screening.tiebreaker_level || "consensus"}
                      </span>
                      <span className="text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>
                        decision level
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {/* Research Sources */}
      {(ideas[0]?._sources?.length ?? 0) > 0 && (
        <BlurFade delay={0.28}>
          <Card className="mt-6" style={{
            boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.06)",
            borderRadius: "8px",
            border: "none",
          }}>
            <CardContent className="p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "oklch(0.72 0.12 178 / 12%)" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12M2 7h12M2 11h8" stroke="oklch(0.72 0.12 178)" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px", color: "oklch(0.22 0.015 65)" }}>
                    Research Sources
                  </h3>
                  <div className="text-xs" style={{ color: "oklch(0.48 0.02 65)" }}>
                    {ideas[0]._sources!.length} sources discovered during pain point research
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {(ideas[0]._sources as string[]).map((url: string, i: number) => {
                  const domain = url.replace(/https?:\/\//, "").split("/")[0].replace(/^www\./, "");
                  const path = url.replace(/https?:\/\/[^/]+/, "").substring(0, 50);
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-[4px] transition-all duration-200 group/link"
                      style={{ color: "oklch(0.48 0.02 65)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(0.94 0.010 85)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full transition-transform duration-200 group-hover/link:scale-150" style={{ background: "oklch(0.72 0.12 178)" }} />
                      <span className="font-medium truncate" style={{ color: "oklch(0.72 0.12 178)" }}>{domain}</span>
                      {path && path !== "/" && <span className="truncate opacity-50">{path}</span>}
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 opacity-0 group-hover/link:opacity-40 transition-opacity">
                        <path d="M4 1h5v5M9 1L4 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      </svg>
                    </a>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {/* Bottom CTA: Forward navigation to /prove */}
      <BlurFade delay={0.24}>
        <Card className="text-center mt-8" style={{
          background: "linear-gradient(135deg, oklch(0.96 0.008 85), oklch(0.94 0.015 52))",
          boxShadow: "0 0 0 1px rgba(237, 233, 224, 0.06), 0 0 40px rgba(212, 116, 60, 0.10)",
          borderRadius: "8px",
          border: "none",
        }}>
          <CardContent className="py-8">
            <h3 className="text-xl font-bold mb-2" style={{
              fontFamily: "var(--font-heading)",
              letterSpacing: "-1px",
              color: "oklch(0.22 0.015 65)",
            }}>
              Ready to Validate?
            </h3>
            <div className="text-sm mb-6" style={{ color: "oklch(0.45 0.02 65)", lineHeight: "1.55", maxWidth: "420px", margin: "0 auto 1.5rem" }}>
              Pick your strongest idea and run it through Prove — a multi-agent debate where 10 AI agents (5 main + 5 sub) stress-test your concept.
            </div>
            <Link
              href={`/prove?idea=${encodeURIComponent(ideas[0]?.name || "")}&from_forge=true`}
              className={buttonVariants({ size: "lg" })}
              style={{
                borderRadius: "9999px",
                background: "oklch(0.84 0.145 85)",
                color: "oklch(0.14 0.008 65)",
                boxShadow: "0 4px 16px rgba(240, 192, 80, 0.25), 0 0 30px rgba(240, 192, 80, 0.10)",
                fontWeight: 600,
              }}
            >
              Verify Top Idea with Prove
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ml-2">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </CardContent>
        </Card>
      </BlurFade>
    </div>
  );
}

// --- Page wrapper ---
export default function ForgeReportPage() {
  return (
    <Suspense fallback={
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <ReportSkeleton />
      </div>
    }>
      <ForgeReportContent />
    </Suspense>
  );
}
