"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  calculateBondingPrice,
  calculateQuota,
  getSlotsRemaining,
  getNextStepPrice,
  generateCurvePoints,
  BASE_PRICES,
  STEP_SIZE,
} from "@/lib/bonding-curve";
import { SolPayButton } from "@/components/sol-pay-button";

type Sku = "scout" | "forge" | "prove" | "bundle" | "cli";
type OwnedMap = Record<Sku, boolean>;
const EMPTY_OWNED: OwnedMap = { scout: false, forge: false, prove: false, bundle: false, cli: false };

/* ─────────────────────────────────────────────
   Brand tokens (from globals.css)
   ───────────────────────────────────────────── */
const EMBER = "oklch(0.62 0.155 52)";
const PATINA = "oklch(0.70 0.12 178)";
const SPARK = "oklch(0.78 0.155 75)";
const SPARK_FG = "oklch(0.18 0.025 65)";
const BG = "oklch(0.98 0.008 85)";
const CARD_BG = "oklch(1 0.005 85)";
const MUTED_FG = "oklch(0.50 0.02 65)";
const FG = "oklch(0.24 0.012 65)";
const BORDER = "oklch(0.90 0.012 75)";

/* Pipeline stage colors */
const SCOUT_COLOR = "oklch(0.60 0.14 178)";
const FORGE_COLOR = "oklch(0.58 0.155 52)";
const PROVE_COLOR = "oklch(0.72 0.155 75)";

/* ─────────────────────────────────────────────
   SKU Data (exported for testing)
   ───────────────────────────────────────────── */
export const SKU_DATA = [
  {
    id: "scout",
    name: "Scout",
    baseCents: BASE_PRICES.scout,
    color: SCOUT_COLOR,
    hexColor: "#3db5a6",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16.5 16.5L20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
    features: [
      "Market gap reports",
      "Sector scanning",
      "Pain cluster analysis",
    ],
    description: "Scan markets and surface hidden gaps",
  },
  {
    id: "forge",
    name: "Forge",
    baseCents: BASE_PRICES.forge,
    color: FORGE_COLOR,
    hexColor: "#d4743c",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 12l8-5M12 12v10M12 12L4 7" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
    features: [
      "5-round brainstorm",
      "Top 3 ranked ideas",
      "Kill/RICE scoring",
    ],
    description: "Generate and rank startup ideas",
  },
  {
    id: "prove",
    name: "Prove",
    baseCents: BASE_PRICES.prove,
    color: PROVE_COLOR,
    hexColor: "#e8a030",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      </svg>
    ),
    features: [
      "6-agent debate",
      "Verdict report",
      "MVP plan + ROI",
    ],
    description: "Stress-test ideas with AI agents",
  },
  {
    id: "bundle",
    name: "Bundle",
    baseCents: BASE_PRICES.bundle,
    badge: "Save 20%",
    color: SPARK,
    hexColor: "#e8a030",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="7" cy="14" r="1.5" fill="currentColor" opacity="0.4" />
      </svg>
    ),
    features: [
      "Scout + Forge + Prove",
      "Full pipeline access",
      "Priority updates",
    ],
    description: "The complete validation toolkit",
  },
  {
    id: "cli",
    name: "CLI",
    baseCents: BASE_PRICES.cli, // $29.90 — more than bundle, power-user tool
    color: PATINA,
    hexColor: "#3db5a6",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 9l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    features: [
      "Terminal workflow",
      "CI/CD integration",
      "All 3 tools included",
    ],
    description: "Validate from your terminal",
  },
];

/** The 3 SKUs shown in the bonding curve tab selector */
export const CURVE_SKUS = SKU_DATA.filter((s) =>
  ["scout", "forge", "prove"].includes(s.id)
);

/* ─────────────────────────────────────────────
   FAQ Data (exported for testing)
   ───────────────────────────────────────────── */
export const FAQ_DATA = [
  {
    q: "What is bonding curve pricing?",
    a: "Our prices follow a bonding curve — a mathematical formula where each purchase increases the price for the next buyer. Every 10 purchases trigger a step increase. This rewards early adopters with the lowest prices while creating natural price discovery.",
  },
  {
    q: "What does 'lifetime' actually mean?",
    a: "Lifetime here means the operating lifetime of the GapSmith service — not yours. You pay once, lock in your tier price, and get access for as long as we run the service. If we ever discontinue, we give 6 months' written notice and refund the unused portion of your annual quota. Full details on the Terms page.",
  },
  {
    q: "What's the annual usage quota?",
    a: "Each purchase comes with a 365-day rolling quota — 12 Scout runs / 6 Forge sessions / 4 Prove debates per year, refreshing on the anniversary of your purchase. Bundle creates 3 separate quotas (one per pipeline). Hit the cap mid-cycle and we route you to Done-For-You as a per-run upsell.",
  },
  {
    q: "Who pays for the AI API costs?",
    a: "You bring your own API key (Anthropic, OpenAI, Google Gemini, MiniMax). API costs go directly to your provider — typically $3-10 for a full Scout → Forge → Prove pipeline run depending on which model you pick. We don't take a margin on token spend. Pure pass-through.",
  },
  {
    q: "Why does the price increase?",
    a: "We use dynamic bonding curve pricing to reward early adopters. Each tool starts at its base price and increases with each step of 10 purchases following an exponential decay curve. The earlier you buy, the better your deal. Prices never go down.",
  },
  {
    q: "Can I upgrade from individual tools to the Bundle?",
    a: "Yes. If you already own individual tools, contact us and we'll credit your previous purchases toward the Bundle price.",
  },
  {
    q: "What's the difference between the Agent API and Done-For-You?",
    a: "Agent API is for AI agents calling our endpoints autonomously — pay-per-request in USDC ($0.05–$15/call), runs on a cost-effective LLM (MiniMax / Sonnet 4.6 tier) so per-call pricing stays sustainable. Done-For-You is the premium service: we run the full pipeline on top-tier LLM (Claude Opus 4.7 / GPT-5.5 Pro) with human review, delivered as a polished PDF in 24-72 hours. Pick by quality vs cost.",
  },
  {
    q: "How does the 'Done For You' service work?",
    a: "You tell us your target sectors (Scout) or share your idea brief (Forge/Prove). We run the pipeline through our internal CLI workflow — top-tier LLM (Opus 4.7 / GPT-5.5 Pro), reviewer-in-the-loop checkpoints between rounds, every cited URL fact-checked. You get a polished report delivered to your inbox in 24-72 hours. $39 / $99 / $149 per run, each stage purchased independently.",
  },
  {
    q: "How does Pay with USDC work?",
    a: "We support x402 payments on Solana. Click 'Pay with USDC' on any pricing card to pay with your Phantom wallet (or any SPL-compatible wallet). The transaction is settled in ~3 seconds. SOL is used only as gas — payment itself is in USDC. Stripe card payment is also available for users who'd rather not use crypto.",
  },
  {
    q: "Can AI agents call your API directly?",
    a: "Yes — that's the Agent API. No signup, no API keys on our side. Agents pay per request in USDC over the x402 protocol, get JSON back. Six live endpoints today (gaps, brief, pain-clusters, trends, keywords, plus the async Forge ideate). See /docs/api for the full spec and a Python reference implementation.",
  },
];

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */
type SkuPriceInfo = {
  amount_cents: number;
  purchase_count: number;
  slots_remaining?: number;
  next_step_price_cents?: number;
  current_step?: number;
  base_cents?: number;
};
type PriceData = Record<string, SkuPriceInfo>;

/* ─────────────────────────────────────────────
   Helper: format cents to dollar string
   ───────────────────────────────────────────── */
function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/* ─────────────────────────────────────────────
   Solana SVG logo inline
   ───────────────────────────────────────────── */
function SolanaLogo({ size = 12 }: { size?: number }) {
  const h = (size / 12) * 10;
  return (
    <svg width={size} height={h} viewBox="0 0 508 456" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M81.3 378.2c3-3 7-4.7 11.3-4.7h404.2c7.1 0 10.7 8.6 5.7 13.6l-79 79c-3 3-7 4.7-11.3 4.7H8c-7.1 0-10.7-8.6-5.7-13.6l79-79z" fill="oklch(0.62 0.13 178)" />
      <path d="M81.3 4.7C84.4 1.7 88.4 0 92.6 0h404.2c7.1 0 10.7 8.6 5.7 13.6l-79 79c-3 3-7 4.7-11.3 4.7H8C.9 97.3-2.7 88.7 2.3 83.7l79-79z" fill="oklch(0.62 0.13 178)" />
      <path d="M423.5 190.6c-3-3-7-4.7-11.3-4.7H8c-7.1 0-10.7 8.6-5.7 13.6l79 79c3 3 7 4.7 11.3 4.7h404.2c7.1 0 10.7-8.6 5.7-13.6l-79-79z" fill="oklch(0.62 0.13 178)" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Check icon for feature lists
   ───────────────────────────────────────────── */
function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
      <path d="M4 8l3 3 5-5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Loading skeleton cards
   ───────────────────────────────────────────── */
function PricingCardSkeleton() {
  return (
    <div
      className="flex h-full flex-col rounded-xl p-6"
      style={{
        background: CARD_BG,
        boxShadow: `0 2px 12px oklch(0.50 0.02 65 / 0.06), 0 0 0 1px oklch(0.90 0.012 75 / 0.5)`,
      }}
    >
      <Skeleton className="h-5 w-20" />
      <Skeleton className="mt-3 h-8 w-24" />
      <Skeleton className="mt-2 h-3 w-16" />
      <div className="mt-5 flex-1 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <Skeleton className="mt-6 h-10 w-full rounded-full" />
      <Skeleton className="mt-2 h-10 w-full rounded-full" />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Section 2: Bonding Curve SVG Visualization
   ───────────────────────────────────────────── */
function BondingCurveChart({
  baseCents,
  purchaseCount,
  color,
  hexColor,
}: {
  baseCents: number;
  purchaseCount: number;
  color: string;
  hexColor: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [drawProgress, setDrawProgress] = useState(0);

  // Generate curve points
  const maxSteps = 21; // 0..20 steps = 0..200 purchases
  // Determine sku id from color for multiplier lookup
  const skuId = baseCents === BASE_PRICES.scout ? "scout" : baseCents === BASE_PRICES.forge ? "forge" : "prove";
  const points = generateCurvePoints(baseCents, maxSteps, skuId);
  const maxPrice = Math.max(...points.map((p) => p.price));
  const minPrice = points[0]?.price ?? baseCents;

  // SVG dimensions
  const W = 600;
  const H = 280;
  const PAD_LEFT = 60;
  const PAD_RIGHT = 30;
  const PAD_TOP = 40;
  const PAD_BOTTOM = 50;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  // Scale functions
  const scaleX = (step: number) => PAD_LEFT + (step / (maxSteps - 1)) * chartW;
  const scaleY = (price: number) =>
    PAD_TOP + chartH - ((price - minPrice * 0.9) / (maxPrice * 1.1 - minPrice * 0.9)) * chartH;

  // Build SVG path
  const pathPoints = points.map((p) => `${scaleX(p.step)},${scaleY(p.price)}`);
  const linePath = `M ${pathPoints.join(" L ")}`;
  const areaPath = `${linePath} L ${scaleX(maxSteps - 1)},${PAD_TOP + chartH} L ${PAD_LEFT},${PAD_TOP + chartH} Z`;

  // Current position on curve
  const currentStep = Math.floor(purchaseCount / STEP_SIZE);
  const currentPrice = calculateBondingPrice(baseCents, purchaseCount, skuId);
  const dotX = scaleX(Math.min(currentStep, maxSteps - 1));
  const dotY = scaleY(currentPrice);

  // Scroll-triggered animation
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      setDrawProgress(1);
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let frame: number;
    let start: number | null = null;
    const duration = 1200;

    function animate(ts: number) {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      setDrawProgress(1 - Math.pow(1 - progress, 3));
      if (progress < 1) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isVisible]);

  // Calculate path length for dash animation
  const pathLength = 2000;

  // X-axis labels (purchases)
  const xLabels = [0, 40, 80, 120, 160, 200];
  // Y-axis labels
  const yRange = maxPrice * 1.1 - minPrice * 0.9;
  const yStep = Math.ceil(yRange / 400) * 100; // round to nearest dollar
  const yLabels: number[] = [];
  for (let p = Math.floor((minPrice * 0.9) / 100) * 100; p <= maxPrice * 1.1; p += yStep) {
    if (p > 0) yLabels.push(p);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      style={{ maxHeight: 320 }}
      role="img"
      aria-label="Bonding curve price chart"
    >
      <defs>
        <linearGradient id={`grad-${hexColor}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hexColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={hexColor} stopOpacity="0.02" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Grid lines */}
      {yLabels.map((p) => (
        <g key={p}>
          <line
            x1={PAD_LEFT}
            y1={scaleY(p)}
            x2={W - PAD_RIGHT}
            y2={scaleY(p)}
            stroke="oklch(0.85 0.008 75)"
            strokeWidth="0.5"
            strokeDasharray="4 4"
          />
          <text
            x={PAD_LEFT - 8}
            y={scaleY(p) + 4}
            textAnchor="end"
            fontSize="11"
            fill="oklch(0.50 0.02 65)"
            fontFamily="var(--font-sans)"
          >
            ${Math.round(p / 100)}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {xLabels.map((n) => {
        const step = n / STEP_SIZE;
        return (
          <text
            key={n}
            x={scaleX(step)}
            y={H - 12}
            textAnchor="middle"
            fontSize="11"
            fill="oklch(0.50 0.02 65)"
            fontFamily="var(--font-sans)"
          >
            {n}
          </text>
        );
      })}
      <text
        x={W / 2}
        y={H - 0}
        textAnchor="middle"
        fontSize="10"
        fill="oklch(0.60 0.02 65)"
        fontFamily="var(--font-sans)"
        fontWeight="500"
      >
        Purchases
      </text>

      {/* Filled area under curve */}
      <path
        d={areaPath}
        fill={`url(#grad-${hexColor})`}
        opacity={drawProgress}
      />

      {/* Curve line */}
      <path
        d={linePath}
        fill="none"
        stroke={hexColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength * (1 - drawProgress)}
        style={{ transition: "none" }}
      />

      {/* Current position pulsing dot */}
      {drawProgress > 0.8 && (
        <g filter="url(#glow)">
          {/* Pulse ring */}
          <circle
            cx={dotX}
            cy={dotY}
            r="12"
            fill="none"
            stroke={hexColor}
            strokeWidth="1.5"
            opacity="0.3"
          >
            <animate
              attributeName="r"
              values="8;16;8"
              dur="2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.4;0.1;0.4"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Solid dot */}
          <circle cx={dotX} cy={dotY} r="5" fill={hexColor} />
          <circle cx={dotX} cy={dotY} r="2.5" fill="white" />
        </g>
      )}

      {/* Annotations */}
      {drawProgress > 0.9 && (
        <>
          {/* "You are here" label */}
          <g
            style={{
              opacity: drawProgress > 0.95 ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            <rect
              x={dotX - 38}
              y={dotY - 32}
              width="76"
              height="20"
              rx="4"
              fill={hexColor}
              opacity="0.9"
            />
            <text
              x={dotX}
              y={dotY - 18}
              textAnchor="middle"
              fontSize="10"
              fill="white"
              fontWeight="600"
              fontFamily="var(--font-sans)"
            >
              You are here
            </text>
          </g>

          {/* Starting price annotation */}
          <text
            x={PAD_LEFT + 6}
            y={scaleY(minPrice) + 16}
            fontSize="10"
            fill="oklch(0.55 0.02 65)"
            fontFamily="var(--font-sans)"
          >
            Base {formatPrice(baseCents)}
          </text>

          {/* Current price annotation */}
          <text
            x={dotX + 14}
            y={dotY + 5}
            fontSize="12"
            fill={hexColor}
            fontWeight="700"
            fontFamily="var(--font-heading)"
          >
            {formatPrice(currentPrice)}
          </text>
        </>
      )}
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Section 3: Per-SKU Status Card (slots remaining)
   ───────────────────────────────────────────── */
function SkuStatusCard({
  sku,
  priceInfo,
}: {
  sku: (typeof SKU_DATA)[number];
  priceInfo: SkuPriceInfo | null;
}) {
  const purchaseCount = priceInfo?.purchase_count ?? 0;
  const currentPrice = priceInfo?.amount_cents ?? calculateBondingPrice(sku.baseCents, 0, sku.id);
  const slotsRemaining = priceInfo?.slots_remaining ?? getSlotsRemaining(purchaseCount);
  const slotsUsed = STEP_SIZE - slotsRemaining;
  const nextPrice = priceInfo?.next_step_price_cents ?? getNextStepPrice(sku.baseCents, purchaseCount, sku.id);
  const progressPct = (slotsUsed / STEP_SIZE) * 100;

  return (
    <div
      className="group relative overflow-hidden rounded-xl p-5 transition-all duration-300"
      style={{
        background: CARD_BG,
        boxShadow: `0 2px 16px oklch(0.50 0.02 65 / 0.06), 0 0 0 1px oklch(0.90 0.012 75 / 0.5)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 4px 24px oklch(from ${sku.color} l c h / 0.12), 0 0 0 1px oklch(from ${sku.color} l c h / 0.25)`;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 2px 16px oklch(0.50 0.02 65 / 0.06), 0 0 0 1px oklch(0.90 0.012 75 / 0.5)`;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: sku.color }}>{sku.icon}</span>
          <span className="font-heading text-base font-bold" style={{ color: FG }}>
            {sku.name}
          </span>
        </div>
        <span
          className="font-heading text-2xl font-bold tabular-nums tracking-tight"
          style={{ color: sku.color }}
        >
          {formatPrice(currentPrice)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs" style={{ color: MUTED_FG }}>
          <span>{slotsUsed}/{STEP_SIZE} purchased at this tier</span>
          <span className="font-semibold" style={{ color: sku.color }}>
            {slotsRemaining} slots left
          </span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full"
          style={{ background: `oklch(from ${sku.color} l c h / 0.1)` }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, oklch(from ${sku.color} l c h / 0.5), ${sku.color})`,
            }}
          />
        </div>
      </div>

      {/* Next tier */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs" style={{ color: MUTED_FG }}>
          Next tier price:
        </span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: FG }}>
          {formatPrice(nextPrice)}
        </span>
      </div>

      {/* CTA */}
      <Link
        href="/signup"
        className="mt-4 block w-full rounded-lg py-2 text-center text-sm font-semibold transition-all duration-200"
        style={{
          background: `oklch(from ${sku.color} l c h / 0.08)`,
          color: sku.color,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `oklch(from ${sku.color} l c h / 0.15)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = `oklch(from ${sku.color} l c h / 0.08)`;
        }}
      >
        Get {sku.name}
      </Link>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Annual quota row (shows what's included with this lifetime purchase)
   ───────────────────────────────────────────── */
function QuotaIncludedRow({
  sku,
  purchaseCount,
  color,
}: {
  sku: string;
  purchaseCount: number;
  color: string;
}) {
  // Bundle / CLI = 3 quotas (split). Direct SKUs = 1.
  let lines: string[];
  if (sku === "bundle") {
    lines = [
      `${calculateQuota("scout", purchaseCount)} Scout runs/yr`,
      `${calculateQuota("forge", purchaseCount)} Forge sessions/yr`,
      `${calculateQuota("prove", purchaseCount)} Prove debates/yr`,
    ];
  } else if (sku === "cli") {
    lines = [
      `${calculateQuota("scout", purchaseCount) * 2} Scout runs/yr`,
      `${calculateQuota("forge", purchaseCount) * 2} Forge sessions/yr`,
      `${calculateQuota("prove", purchaseCount) * 2} Prove debates/yr`,
    ];
  } else {
    const label =
      sku === "scout"
        ? "Scout runs"
        : sku === "forge"
          ? "Forge sessions"
          : "Prove debates";
    lines = [`${calculateQuota(sku, purchaseCount)} ${label}/yr included`];
  }
  return (
    <div
      className="mb-3 rounded-lg px-3 py-2 text-xs"
      style={{
        background: `oklch(from ${color} l c h / 0.06)`,
        boxShadow: `inset 0 0 0 1px oklch(from ${color} l c h / 0.15)`,
      }}
    >
      <div className="font-semibold uppercase tracking-wide text-[10px] mb-1" style={{ color }}>
        Annual usage included
      </div>
      {lines.map((l) => (
        <div key={l} className="flex items-center gap-1.5" style={{ color: FG }}>
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: color }} />
          {l}
        </div>
      ))}
      <div className="mt-1 text-[10px]" style={{ color: MUTED_FG, opacity: 0.7 }}>
        beyond quota → premium Done-For-You service
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Section 4: Full Pricing Card Component
   ───────────────────────────────────────────── */
function PricingCard({
  sku,
  priceData,
  isLoggedIn,
  isOwned,
}: {
  sku: (typeof SKU_DATA)[number];
  priceData: PriceData | null;
  isLoggedIn: boolean;
  isOwned: boolean;
}) {
  const isBundle = sku.id === "bundle";
  const isComingSoon = sku.id === "cli";
  const price = priceData?.[sku.id];
  const currentCents = price?.amount_cents ?? calculateBondingPrice(sku.baseCents, 0, sku.id);
  const purchaseCount = price?.purchase_count ?? 0;
  const slotsRemaining = price?.slots_remaining ?? getSlotsRemaining(purchaseCount);
  const productPath = sku.id === "scout" || sku.id === "forge" || sku.id === "prove"
    ? `/${sku.id}`
    : null;

  return (
    <div
      className={`relative flex h-full flex-col rounded-xl p-6 transition-all duration-300 hover:scale-[1.02] ${isBundle ? "lg:scale-[1.04]" : ""}`}
      style={{
        background: isBundle
          ? `linear-gradient(135deg, ${CARD_BG}, oklch(0.99 0.008 75))`
          : CARD_BG,
        boxShadow: isBundle
          ? `0 4px 24px oklch(0.62 0.155 52 / 0.12), 0 0 0 1px oklch(0.78 0.155 75 / 0.3)`
          : `0 2px 12px oklch(0.50 0.02 65 / 0.06), 0 0 0 1px oklch(0.90 0.012 75 / 0.5)`,
      }}
    >
      {isBundle && (
        <BorderBeam
          size={120}
          duration={8}
          colorFrom={SPARK}
          colorTo={EMBER}
        />
      )}

      {/* Coming Soon overlay (CLI only) — light frost so the CLI name + icon
          stay visible underneath; the badge sits centered as the focal point. */}
      {isComingSoon && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-xl"
          style={{
            background: "oklch(0.98 0.005 80 / 0.40)",
            backdropFilter: "blur(0.8px) saturate(0.85)",
            WebkitBackdropFilter: "blur(0.8px) saturate(0.85)",
            boxShadow: `inset 0 0 0 1px ${BORDER}`,
          }}
          aria-hidden="true"
        >
          {/* Diagonal sash for the watermark feel */}
          <span
            className="rotate-[-12deg] select-none rounded-md px-5 py-2 font-heading text-base font-bold uppercase tracking-[0.18em] shadow-md"
            style={{
              color: "white",
              background: PATINA,
              boxShadow: `0 0 0 1px oklch(0.55 0.15 178), 0 6px 24px oklch(0.62 0.13 178 / 0.32)`,
              letterSpacing: "0.18em",
            }}
          >
            Coming Soon
          </span>
        </div>
      )}

      {/* Badge */}
      {"badge" in sku && sku.badge && (
        <span
          className="absolute -top-3 right-4 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: SPARK, color: SPARK_FG }}
        >
          {sku.badge}
        </span>
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span style={{ color: sku.color }}>{sku.icon}</span>
        <h3 className="font-heading text-lg font-bold" style={{ color: FG }}>
          {sku.name}
        </h3>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MUTED_FG }}>
        {sku.description}
      </p>

      {/* Price */}
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-heading text-3xl font-bold tabular-nums" style={{ color: FG }}>
          {formatPrice(currentCents)}
        </span>
        <span className="text-sm" style={{ color: MUTED_FG }}>
          for Lifetime
          <Link
            href="/terms"
            className="ml-0.5 hover:underline"
            style={{ color: MUTED_FG }}
            title="Terms & Conditions apply"
          >
            *
          </Link>
        </span>
      </div>

      {/* Progress bar + slots remaining */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs" style={{ color: MUTED_FG }}>
          <span>{STEP_SIZE - slotsRemaining}/{STEP_SIZE} sold at this tier</span>
          <span className="font-semibold" style={{ color: sku.color }}>
            {slotsRemaining} slots left
          </span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full"
          style={{ background: `oklch(from ${sku.color} l c h / 0.1)` }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${((STEP_SIZE - slotsRemaining) / STEP_SIZE) * 100}%`,
              background: `linear-gradient(90deg, oklch(from ${sku.color} l c h / 0.5), ${sku.color})`,
            }}
          />
        </div>
      </div>

      {/* Next tier price */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: MUTED_FG }}>
          Next tier:
        </span>
        <span className="font-heading text-lg font-bold tabular-nums" style={{ color: sku.color }}>
          {formatPrice(priceData?.[sku.id]?.next_step_price_cents ?? getNextStepPrice(sku.baseCents, purchaseCount, sku.id))}
        </span>
      </div>

      {/* Separator */}
      <div className="my-4 h-px" style={{ background: BORDER }} />

      {/* Annual usage quota — sub-linear vs price (early adopters get best per-run rate) */}
      <QuotaIncludedRow sku={sku.id} purchaseCount={purchaseCount} color={sku.color} />

      {/* Features */}
      <ul className="flex-1 space-y-2.5">
        {sku.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm" style={{ color: MUTED_FG }}>
            <CheckIcon color={sku.color} />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA — owned takes precedence, otherwise show payment options */}
      {isOwned && productPath ? (
        <Link
          href={productPath}
          className="mt-6 block w-full rounded-full py-2.5 text-center text-sm font-semibold transition-all duration-200"
          style={{ background: sku.color, color: "white" }}
        >
          Open {sku.name}
        </Link>
      ) : isOwned ? (
        <div
          className="mt-6 block w-full rounded-full py-2.5 text-center text-sm font-semibold"
          style={{ background: `oklch(from ${sku.color} l c h / 0.12)`, color: sku.color }}
        >
          Owned ✓
        </div>
      ) : (
        <>
          {/* PRIMARY: USDC via x402 — Solana-native, hackathon focus */}
          <SolPayButton
            sku={sku.id as Sku}
            isLoggedIn={isLoggedIn}
            isOwned={false}
            priceUsdc={(currentCents / 100).toFixed(2)}
            variant="primary"
          />

          {/* SECONDARY: card via Stripe — small text-link */}
          <div className="mt-3 text-center text-xs" style={{ color: MUTED_FG }}>
            <span style={{ opacity: 0.6 }}>or </span>
            {isLoggedIn ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/checkout", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ plan: sku.id }),
                    });
                    const data = await res.json();
                    if (data?.url) {
                      window.location.href = data.url;
                    } else {
                      alert(data?.error ?? "Could not create checkout session");
                    }
                  } catch (err) {
                    alert(`Checkout failed: ${(err as Error).message}`);
                  }
                }}
                className="underline hover:opacity-100 transition-opacity"
                style={{ color: FG, opacity: 0.7 }}
              >
                pay {formatPrice(currentCents)} with card →
              </button>
            ) : (
              <Link
                href={`/signup?next=/pricing&sku=${sku.id}`}
                className="underline hover:opacity-100 transition-opacity"
                style={{ color: FG, opacity: 0.7 }}
              >
                sign up to pay with card →
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Section 5: How Dynamic Pricing Works (3-step)
   ───────────────────────────────────────────── */
function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "Start Low",
      desc: "Base prices reward early adopters. Scout starts at just $4.90.",
      color: PATINA,
      icon: (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M16 10v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      num: "02",
      title: "Step Up",
      desc: "Every 10 purchases, the price increases following the bonding curve. Demand drives value.",
      color: EMBER,
      icon: (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M6 26L13 18L18 22L26 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 10h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      num: "03",
      title: "Lock In",
      desc: "Your purchase price is locked forever, no matter how high the curve goes after you buy.",
      color: SPARK,
      icon: (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="8" y="14" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 14V10a4 4 0 018 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="16" cy="20" r="2" fill="currentColor" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {steps.map((step, i) => (
        <BlurFade key={step.num} delay={0.1 + i * 0.1} inView>
          <div
            className="relative overflow-hidden rounded-xl p-6 transition-all duration-300"
            style={{
              background: `linear-gradient(135deg, oklch(from ${step.color} l c h / 0.04), oklch(from ${step.color} l c h / 0.02))`,
              boxShadow: `0 2px 12px oklch(from ${step.color} l c h / 0.06), 0 0 0 1px oklch(from ${step.color} l c h / 0.1)`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.boxShadow = `0 8px 24px oklch(from ${step.color} l c h / 0.12), 0 0 0 1px oklch(from ${step.color} l c h / 0.2)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = `0 2px 12px oklch(from ${step.color} l c h / 0.06), 0 0 0 1px oklch(from ${step.color} l c h / 0.1)`;
            }}
          >
            {/* Step number watermark */}
            <span
              className="font-heading absolute -right-2 -top-4 text-[72px] font-bold leading-none"
              style={{ color: `oklch(from ${step.color} l c h / 0.06)` }}
            >
              {step.num}
            </span>

            <span style={{ color: step.color }}>{step.icon}</span>
            <h3
              className="font-heading mt-4 text-lg font-bold"
              style={{ color: FG }}
            >
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: MUTED_FG }}>
              {step.desc}
            </p>
          </div>
        </BlurFade>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Page Component
   ───────────────────────────────────────────── */
export default function PricingPage() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("scout");
  const [owned, setOwned] = useState<OwnedMap>(EMPTY_OWNED);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/pricing")
      .then((res) => res.json())
      .then((data) => {
        setPriceData(data.prices ?? null);
      })
      .catch(() => {
        setPriceData(null);
      })
      .finally(() => setLoading(false));

    // Ownership map — non-blocking, defaults to empty if unauth/error
    fetch("/api/access/check")
      .then((res) => res.json())
      .then((data) => {
        if (data?.owned) {
          setOwned(data.owned);
          // Any owned SKU implies logged-in. Also flag logged-in if we got a response at all
          // (the route returns 200 with empty owned for anon users — distinguish via cookies).
          const hasAny = Object.values(data.owned).some(Boolean);
          if (hasAny) setIsLoggedIn(true);
        }
      })
      .catch(() => {});

    // Check login state via supabase client — needed for the "Sign up to Pay" CTA on unowned cards
    import("@/lib/supabase").then(({ createClient }) => {
      const sb = createClient();
      sb.auth.getUser().then((res: { data: { user: { id: string } | null } }) => {
        if (res.data.user) setIsLoggedIn(true);
      });
    });
  }, []);

  const topRow = SKU_DATA.filter((s) => ["scout", "forge", "prove"].includes(s.id));
  const bottomRow = SKU_DATA.filter((s) => ["bundle", "cli"].includes(s.id));
  const activeSku = CURVE_SKUS.find((s) => s.id === activeTab) ?? CURVE_SKUS[0];

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* ─── SECTION 1: HERO ─── */}
      <section className="relative overflow-hidden pb-12 pt-12 md:pb-16 md:pt-16">
        {/* Background radial gradient */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 60% 40% at 50% 20%, oklch(0.78 0.155 75 / 0.08), transparent 70%), radial-gradient(ellipse 40% 50% at 80% 60%, oklch(0.70 0.12 178 / 0.05), transparent 60%)`,
          }}
        />

        {/* Subtle dot pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, ${FG} 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative mx-auto max-w-[1200px] px-6">
          <BlurFade delay={0.05} inView>
            <div className="flex justify-center">
              <AnimatedShinyText
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium"
                style={{
                  background: "oklch(0.96 0.018 178)",
                  boxShadow: `0 0 0 1px oklch(0.62 0.13 178 / 0.30), inset 0 0 0 1px oklch(0.62 0.13 178 / 0.18)`,
                }}
              >
                <SolanaLogo size={12} />
                <span style={{ color: "oklch(0.32 0.06 178)" }}>
                  Powered by x402 on Solana
                </span>
              </AnimatedShinyText>
            </div>
          </BlurFade>

          <BlurFade delay={0.12} inView>
            <h1
              className="font-heading mx-auto mt-6 max-w-3xl text-center text-4xl font-bold leading-[1.08] tracking-[-2px] md:text-5xl lg:text-[64px]"
              style={{ color: FG }}
            >
              The AI venture builder where{" "}
              <span
                style={{
                  background: `linear-gradient(135deg, oklch(0.62 0.155 52), oklch(0.62 0.13 178))`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                AI agents pay AI agents.
              </span>
            </h1>
          </BlurFade>

          <BlurFade delay={0.2} inView>
            <p
              className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed md:text-lg"
              style={{ color: MUTED_FG, lineHeight: "1.6" }}
            >
              Pay with USDC on Solana — instant, irreversible, no chargebacks. Bonding curve rewards early believers: each {STEP_SIZE} purchases, the price steps up. Lock in your tier today.
            </p>
          </BlurFade>
        </div>
      </section>

      {/* ─── SECTION 2: BONDING CURVE VISUALIZATION ─── */}
      <section className="relative px-6 pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <BlurFade delay={0.1} inView>
            <div className="text-center">
              <p
                className="text-sm font-medium uppercase tracking-widest"
                style={{ color: PATINA }}
              >
                The Curve
              </p>
              <h2
                className="font-heading mt-3 text-2xl font-bold leading-[1.1] tracking-[-1px] md:text-3xl"
                style={{ color: FG }}
              >
                Watch prices climb in real-time
              </h2>
            </div>
          </BlurFade>

          <BlurFade delay={0.2} inView>
            <div className="mt-8">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mx-auto flex w-fit gap-1 rounded-full border bg-transparent p-1" style={{ borderColor: BORDER }}>
                  {CURVE_SKUS.map((sku) => (
                    <TabsTrigger
                      key={sku.id}
                      value={sku.id}
                      className="rounded-full px-5 py-1.5 text-sm font-medium transition-all duration-200 data-[state=active]:text-white"
                      style={{
                        color: activeTab === sku.id ? undefined : MUTED_FG,
                        background: activeTab === sku.id ? sku.color : "transparent",
                      }}
                    >
                      {sku.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {CURVE_SKUS.map((sku) => (
                  <TabsContent key={sku.id} value={sku.id} className="mt-6">
                    <div
                      className="overflow-hidden rounded-2xl p-4 md:p-6"
                      style={{
                        background: CARD_BG,
                        boxShadow: `0 4px 32px oklch(from ${sku.color} l c h / 0.08), 0 0 0 1px oklch(from ${sku.color} l c h / 0.12)`,
                      }}
                    >
                      <BondingCurveChart
                        baseCents={sku.baseCents}
                        purchaseCount={priceData?.[sku.id]?.purchase_count ?? 0}
                        color={sku.color}
                        hexColor={sku.hexColor}
                      />
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* ─── SECTION 3: ALL 5 SKU PRICING CARDS ─── */}
      <section className="relative px-6 py-16 md:py-24">
        <div className="mx-auto max-w-[1200px]">
          <BlurFade delay={0.1} inView>
            <div className="text-center">
              <p
                className="text-sm font-medium uppercase tracking-widest"
                style={{ color: SPARK }}
              >
                Choose your tool
              </p>
              <h2
                className="font-heading mt-3 text-2xl font-bold leading-[1.1] tracking-[-1px] md:text-3xl lg:text-4xl"
                style={{ color: FG }}
              >
                Simple, transparent pricing
              </h2>
            </div>
          </BlurFade>

          {/* Top row: Scout, Forge, Prove */}
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 3 }, (_, i) => (
                  <BlurFade key={i} delay={0.15 + i * 0.08} inView>
                    <PricingCardSkeleton />
                  </BlurFade>
                ))
              : topRow.map((sku, i) => (
                  <BlurFade key={sku.id} delay={0.15 + i * 0.08} inView>
                    <PricingCard
                      sku={sku}
                      priceData={priceData}
                      isLoggedIn={isLoggedIn}
                      isOwned={owned[sku.id as Sku] ?? false}
                    />
                  </BlurFade>
                ))}
          </div>

          {/* Bottom row: Bundle, CLI (centered) */}
          <div className="mx-auto mt-5 grid max-w-[800px] gap-5 sm:grid-cols-2">
            {loading
              ? Array.from({ length: 2 }, (_, i) => (
                  <BlurFade key={i} delay={0.4 + i * 0.08} inView>
                    <PricingCardSkeleton />
                  </BlurFade>
                ))
              : bottomRow.map((sku, i) => (
                  <BlurFade key={sku.id} delay={0.4 + i * 0.08} inView>
                    <PricingCard
                      sku={sku}
                      priceData={priceData}
                      isLoggedIn={isLoggedIn}
                      isOwned={owned[sku.id as Sku] ?? false}
                    />
                  </BlurFade>
                ))}
          </div>

          {/* x402 Solana badge */}
          <BlurFade delay={0.6} inView>
            <div className="mt-10 flex justify-center">
              <div
                className="inline-flex items-center gap-2.5 rounded-full px-5 py-2"
                style={{
                  background: "oklch(0.96 0.018 178)",
                  boxShadow: `0 0 0 1px oklch(0.62 0.13 178 / 0.30), 0 0 30px oklch(0.62 0.13 178 / 0.10)`,
                }}
              >
                <SolanaLogo size={16} />
                <span
                  className="text-xs font-medium tracking-wide"
                  style={{ color: "oklch(0.32 0.06 178)" }}
                >
                  Powered by x402 on Solana
                </span>
                <span
                  className="relative flex h-1.5 w-1.5"
                  aria-hidden
                >
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                    style={{ background: "oklch(0.62 0.13 178)" }}
                  />
                  <span
                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ background: "oklch(0.62 0.13 178)" }}
                  />
                </span>
              </div>
            </div>
          </BlurFade>

          {/* Lifetime asterisk footnote */}
          <BlurFade delay={0.65} inView>
            <p className="mt-4 text-center text-xs" style={{ color: MUTED_FG, opacity: 0.75 }}>
              * &ldquo;Lifetime&rdquo; means the operating lifetime of the service.{" "}
              <Link href="/terms" className="underline hover:opacity-100" style={{ color: MUTED_FG }}>
                Terms &amp; Conditions
              </Link>{" "}
              apply.
            </p>
          </BlurFade>
        </div>
      </section>

      {/* ─── SECTION 5: HOW DYNAMIC PRICING WORKS ─── */}
      <section
        className="relative px-6 py-16 md:py-24"
        style={{
          background: `linear-gradient(180deg, oklch(0.97 0.015 60), oklch(0.96 0.012 80))`,
        }}
      >
        <div className="mx-auto max-w-4xl">
          <BlurFade delay={0.1} inView>
            <div className="mb-12 text-center">
              <span
                className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
                style={{ background: `oklch(from ${EMBER} l c h / 0.1)`, color: EMBER }}
              >
                How it works
              </span>
              <h2
                className="font-heading mt-4 text-2xl font-bold leading-[1.1] tracking-[-1px] md:text-3xl"
                style={{ color: FG }}
              >
                Dynamic pricing in 3 steps
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed" style={{ color: MUTED_FG }}>
                Our bonding curve formula ensures fair pricing that rewards early supporters while maintaining sustainable growth.
              </p>
            </div>
          </BlurFade>

          <HowItWorksSection />
        </div>
      </section>

      {/* ─── SECTION 6: DONE FOR YOU SERVICES ─── */}
      <section className="relative px-6 py-16 md:py-24">
        <div className="mx-auto max-w-4xl">
          <BlurFade delay={0.1} inView>
            <div className="text-center">
              <span
                className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
                style={{ background: `oklch(from ${PATINA} l c h / 0.1)`, color: PATINA }}
              >
                Premium Service
              </span>
              <h2
                className="font-heading mt-4 text-2xl font-bold leading-[1.1] tracking-[-1px] md:text-3xl lg:text-4xl"
                style={{ color: FG }}
              >
                Let us do the heavy lifting
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed" style={{ color: MUTED_FG }}>
                No API key needed. Our team runs the full analysis and delivers a polished report to your inbox. Buy each stage separately — only pay for what you need.
              </p>
            </div>
          </BlurFade>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                name: "Scout Run",
                price: "$39",
                color: SCOUT_COLOR,
                hexColor: "#3db5a6",
                description: "We scan your target sectors and deliver a complete market gap report with pain clusters and trends.",
                deliverable: "Full Scout report (PDF + interactive)",
                turnaround: "24-48 hours",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M16.5 16.5L20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                  </svg>
                ),
              },
              {
                name: "Forge Run",
                price: "$99",
                color: FORGE_COLOR,
                hexColor: "#d4743c",
                description: "We run the 5-round brainstorm on your market gaps and deliver your top 3 startup ideas with Kill/RICE scores.",
                deliverable: "Top 3 ideas ranked + full brainstorm transcript",
                turnaround: "48-72 hours",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M12 12l8-5M12 12v10M12 12L4 7" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                  </svg>
                ),
              },
              {
                name: "Prove Run",
                price: "$149",
                color: PROVE_COLOR,
                hexColor: "#e8a030",
                description: "10 AI agents (5 main + 5 sub) debate your idea across multiple rounds. You get the full verdict, MVP plan, and ROI analysis.",
                deliverable: "Verdict report + MVP roadmap + ROI breakdown",
                turnaround: "48-72 hours",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 9h18" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                  </svg>
                ),
              },
            ].map((service, i) => (
              <BlurFade key={service.name} delay={0.15 + i * 0.1} inView>
                <div
                  className="relative flex h-full flex-col rounded-xl p-6 transition-all duration-300 hover:scale-[1.02]"
                  style={{
                    background: CARD_BG,
                    boxShadow: `0 2px 16px oklch(from ${service.color} l c h / 0.08), 0 0 0 1px oklch(from ${service.color} l c h / 0.15)`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 8px 32px oklch(from ${service.color} l c h / 0.15), 0 0 0 1px oklch(from ${service.color} l c h / 0.25)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 2px 16px oklch(from ${service.color} l c h / 0.08), 0 0 0 1px oklch(from ${service.color} l c h / 0.15)`;
                  }}
                >
                  {/* Top color accent bar */}
                  <div
                    className="absolute left-0 top-0 h-1 w-full rounded-t-xl"
                    style={{ background: `linear-gradient(90deg, ${service.color}, oklch(from ${service.color} l c h / 0.4))` }}
                  />

                  <span style={{ color: service.color }}>{service.icon}</span>

                  <h3 className="font-heading mt-3 text-lg font-bold" style={{ color: FG }}>
                    {service.name}
                  </h3>

                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-heading text-3xl font-bold" style={{ color: service.color }}>
                      {service.price}
                    </span>
                    <span className="text-sm" style={{ color: MUTED_FG }}>per run</span>
                  </div>

                  <p className="mt-3 flex-1 text-sm leading-relaxed" style={{ color: MUTED_FG }}>
                    {service.description}
                  </p>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs" style={{ color: FG }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M4 8l3 3 5-5.5" stroke={service.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {service.deliverable}
                    </div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: FG }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="5.5" stroke={service.color} strokeWidth="1.5" />
                        <path d="M8 5.5v3l2 1" stroke={service.color} strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      {service.turnaround}
                    </div>
                  </div>

                  <Link
                    href={`/order/${service.name.split(" ")[0].toLowerCase()}`}
                    className="mt-5 block w-full rounded-full py-2.5 text-center text-sm font-semibold transition-all duration-200"
                    style={{
                      background: `oklch(from ${service.color} l c h / 0.08)`,
                      color: service.color,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `oklch(from ${service.color} l c h / 0.15)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `oklch(from ${service.color} l c h / 0.08)`;
                    }}
                  >
                    Order {service.name}
                  </Link>
                </div>
              </BlurFade>
            ))}
          </div>

          <BlurFade delay={0.5} inView>
            <p className="mt-8 text-center text-sm" style={{ color: MUTED_FG }}>
              Each stage is independent — start with a Scout Run, then decide if you want to go deeper.
            </p>
          </BlurFade>
        </div>
      </section>

      {/* ─── SECTION 7: FAQ ─── */}
      <section className="relative px-6 py-16 md:py-24">
        <div className="mx-auto max-w-2xl">
          <BlurFade delay={0.1} inView>
            <div className="text-center">
              <p
                className="text-sm font-medium uppercase tracking-widest"
                style={{ color: PATINA }}
              >
                FAQ
              </p>
              <h2
                className="font-heading mt-3 text-2xl font-bold leading-[1.1] tracking-[-1px] md:text-3xl"
                style={{ color: FG }}
              >
                Common questions
              </h2>
            </div>
          </BlurFade>

          <BlurFade delay={0.2} inView>
            <Accordion className="mt-10">
              {FAQ_DATA.map((item, i) => (
                <AccordionItem key={i} value={i}>
                  <AccordionTrigger
                    className="py-4 text-left text-base font-semibold"
                    style={{ color: FG }}
                  >
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm leading-relaxed" style={{ color: MUTED_FG }}>
                      {item.a}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </BlurFade>
        </div>
      </section>

      {/* ─── SECTION 7: BOTTOM CTA ─── */}
      <section className="relative px-6 pb-24 pt-8 md:pb-32">
        <BlurFade delay={0.1} inView>
          <div
            className="mx-auto max-w-2xl overflow-hidden rounded-2xl p-10 text-center md:p-14"
            style={{
              background: `linear-gradient(135deg, oklch(0.96 0.015 52), oklch(0.97 0.012 75))`,
              boxShadow: `0 4px 32px oklch(0.62 0.155 52 / 0.1), 0 0 0 1px oklch(0.90 0.012 75 / 0.5)`,
            }}
          >
            <h2
              className="font-heading text-2xl font-bold leading-[1.1] tracking-[-1px] md:text-3xl"
              style={{ color: FG }}
            >
              Ready to validate your next idea?
            </h2>
            <p className="mt-3 text-sm leading-relaxed md:text-base" style={{ color: MUTED_FG }}>
              Lock in today&apos;s price before the next step increase. Every {STEP_SIZE} purchases raises the curve.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-block rounded-full px-8 py-3 text-sm font-semibold transition-all duration-200"
              style={{ background: SPARK, color: SPARK_FG }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 4px 20px oklch(from ${SPARK} l c h / 0.35)`;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Get started now
            </Link>
          </div>
        </BlurFade>
      </section>
    </div>
  );
}
