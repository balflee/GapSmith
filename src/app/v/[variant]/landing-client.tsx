"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import type { VARIANTS } from "@/lib/variants";
import { trackVisitLanding, trackCtaClick } from "@/lib/events";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { MagicCard } from "@/components/ui/magic-card";
import { Marquee } from "@/components/ui/marquee";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";


type Variant = (typeof VARIANTS)[number];

// Optional slot for the homepage traction strip — passed in as a server-
// rendered React node by app/page.tsx so the strip can read live data
// without forcing this component server-side.
interface LandingPageProps {
  variant: Variant;
  tractionSlot?: ReactNode;
}

/* ---------- Pipeline data ---------- */
const PIPELINE_STAGES = [
  {
    key: "scout" as const,
    title: "Scout",
    tagline: "Scan the noise. Surface the signal.",
    description:
      "AI agents scan 79 RSS sources + 100 community pain feeds (Reddit, HN, GitHub Issues), score the signal, and surface the market gaps nobody else sees. Output: a daily brief, 10 pain clusters, and 3 venture-grade topic cards with concrete wedges.",
    image: "/images/feature-1.webp",
    alt: "Abstract radar scanning pattern with teal concentric rings and data points representing market signal discovery",
    colorClass: "text-scout",
    bgGlow: "from-[oklch(0.60_0.14_178/0.10)]",
    borderColor: "oklch(0.60 0.14 178)",
  },
  {
    key: "forge" as const,
    title: "Forge",
    tagline: "Shape raw gaps into startup ideas.",
    description:
      "5-round multi-agent ideation — Proposer drafts, Defender coaches, plus Trend Scout, Contrarian, Gap Finder, Benchmark Hunter, and Evidence Hunter inject competitive context. A final screening pass casts kill votes + RICE scores. Output: your top 3 ideas with 20 structured fields each.",
    image: "/images/feature-2.webp",
    alt: "Warm abstract shapes flowing into geometric crystalline forms representing AI-powered idea generation",
    colorClass: "text-forge",
    bgGlow: "from-[oklch(0.58_0.155_52/0.10)]",
    borderColor: "oklch(0.58 0.155 52)",
  },
  {
    key: "prove" as const,
    title: "Prove",
    tagline: "10 agents debate. Only strong ideas survive.",
    description:
      "Adversarial debate — Proposer defends, Challenger attacks market viability, Analyst pressure-tests unit economics, Defender steelmans, Reviewer fact-checks every claim. Five sub-agents add competitive evidence. Output: a verdict — APPROVED / CONDITIONAL / PIVOT OUT / REJECTED — with reasoning.",
    image: "/images/feature-3.webp",
    alt: "Bright lattice with interconnected glowing nodes representing multi-agent debate and idea validation",
    colorClass: "text-prove",
    bgGlow: "from-[oklch(0.72_0.155_75/0.10)]",
    borderColor: "oklch(0.72 0.155 75)",
  },
];

/* Solana ecosystem accent — translated into the Workshop palette.
   Patina (teal) bridges to Solana's green; Ember anchors the action layer. */
const ECO_TEAL = "oklch(0.62 0.13 178)";

const SOCIAL_METRICS = [
  { label: "AI Pipelines", value: 3, suffix: "" },
  { label: "Pay-per-call API endpoints", value: 9, suffix: "" },
  { label: "Avg. End-to-End Time", value: 2, suffix: "hrs" },
];

/* ---------- Spotlight Sweep Hook ---------- */
function useSpotlightSweep() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame: number;
    let angle = 0;
    const animate = () => {
      angle = (angle + 0.15) % 360;
      const rad = (angle * Math.PI) / 180;
      const x = 50 + 35 * Math.cos(rad);
      const y = 50 + 25 * Math.sin(rad);
      el.style.setProperty("--sweep-x", `${x}%`);
      el.style.setProperty("--sweep-y", `${y}%`);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  return ref;
}

/* ---------- Scroll counter hook ---------- */
function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const handler = () => {
      const scrollY = window.scrollY;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docH > 0 ? Math.min(scrollY / docH, 1) : 0);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);
  return progress;
}

/* ========== MAIN COMPONENT ========== */
export default function LandingPage({ variant, tractionSlot }: LandingPageProps) {
  const spotlightRef = useSpotlightSweep();
  const scrollProgress = useScrollProgress();

  useEffect(() => {
    trackVisitLanding({
      variant: variant.slug,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
    });
  }, [variant.slug]);

  const handleCtaClick = () => {
    trackCtaClick({ variant: variant.slug, cta_text: variant.cta });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      {/* Scroll progress bar */}
      <div
        className="fixed top-0 left-0 z-50 h-[2px]"
        style={{
          width: `${scrollProgress * 100}%`,
          background: "linear-gradient(90deg, oklch(0.62 0.155 52), oklch(0.78 0.155 75))",
          transition: "width 50ms linear",
        }}
      />

      {/* ============ HERO SECTION ============ */}
      <section
        ref={spotlightRef}
        className="relative flex min-h-[88vh] items-center overflow-hidden lg:min-h-[92vh]"
        style={{
          ["--sweep-x" as string]: "50%",
          ["--sweep-y" as string]: "50%",
        }}
      >
        {/* Background layers */}
        <div className="pointer-events-none absolute inset-0">
          {/* Radial gradient mesh */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at var(--sweep-x) var(--sweep-y), oklch(0.62 0.155 52 / 0.06), transparent 70%), radial-gradient(ellipse 50% 40% at 80% 20%, oklch(0.70 0.12 178 / 0.04), transparent 60%)",
            }}
          />
          {/* Noise overlay */}
          <svg className="absolute inset-0 h-full w-full opacity-[0.035]" aria-hidden="true">
            <filter id="hero-noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#hero-noise)" />
          </svg>
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-12 px-6 py-24 lg:grid-cols-2 lg:gap-8 lg:py-0">
          {/* Left: copy */}
          <div className="flex flex-col justify-center">
            <BlurFade delay={0.1} inView>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5" style={{ boxShadow: "0 0 0 1px oklch(0.85 0.015 75 / 0.5)", background: "oklch(0.97 0.008 85)" }}>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forge opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-forge" />
                  </span>
                  <AnimatedShinyText className="text-sm tracking-normal">
                    Scout. Forge. Prove.
                  </AnimatedShinyText>
                </div>
                <div
                  className="inline-flex items-center gap-2 rounded-full px-4 py-1.5"
                  style={{
                    background: "oklch(0.96 0.025 178)",
                    boxShadow: `0 0 0 1px ${ECO_TEAL} / 0.35, inset 0 0 0 1px oklch(0.62 0.13 178 / 0.25)`,
                  }}
                >
                  <svg width="14" height="12" viewBox="0 0 508 456" fill="none" aria-hidden="true" className="shrink-0">
                    <path d="M81.3 378.2c3-3 7-4.7 11.3-4.7h404.2c7.1 0 10.7 8.6 5.7 13.6l-79 79c-3 3-7 4.7-11.3 4.7H8c-7.1 0-10.7-8.6-5.7-13.6l79-79z" fill={ECO_TEAL} />
                    <path d="M81.3 4.7C84.4 1.7 88.4 0 92.6 0h404.2c7.1 0 10.7 8.6 5.7 13.6l-79 79c-3 3-7 4.7-11.3 4.7H8C.9 97.3-2.7 88.7 2.3 83.7l79-79z" fill={ECO_TEAL} />
                    <path d="M423.5 190.6c-3-3-7-4.7-11.3-4.7H8c-7.1 0-10.7 8.6-5.7 13.6l79 79c3 3 7 4.7 11.3 4.7h404.2c7.1 0 10.7-8.6 5.7-13.6l-79-79z" fill={ECO_TEAL} />
                  </svg>
                  <span className="text-sm font-medium" style={{ color: "oklch(0.32 0.06 178)" }}>
                    Pay with USDC via x402
                  </span>
                </div>
              </div>
            </BlurFade>

            <BlurFade delay={0.2} inView>
              <h1
                className="font-heading text-4xl font-bold leading-[1.08] tracking-[-2px] md:text-5xl lg:text-[61px]"
                style={{ color: "var(--foreground)" }}
              >
                {variant.headline}
              </h1>
            </BlurFade>

            <BlurFade delay={0.35} inView>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground md:text-xl">
                {variant.subheadline}
              </p>
            </BlurFade>

            <BlurFade delay={0.5} inView>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link href="/signup" onClick={handleCtaClick}>
                  <ShimmerButton
                    shimmerColor="oklch(0.78 0.155 75)"
                    background="oklch(0.78 0.155 75)"
                    shimmerSize="0.05em"
                    className="px-8 py-4 text-base font-semibold text-spark-foreground"
                  >
                    {variant.cta}
                  </ShimmerButton>
                </Link>
                <Link
                  href="/docs/x402"
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-3 text-sm font-medium transition-colors hover:underline"
                  style={{
                    background: "oklch(1 0.005 85)",
                    color: "oklch(0.30 0.015 65)",
                    boxShadow: "0 0 0 1px oklch(0.85 0.015 75)",
                  }}
                >
                  How it works on Solana
                  <span aria-hidden>→</span>
                </Link>
                <span className="text-sm text-muted-foreground">
                  Free to sign up
                </span>
              </div>
            </BlurFade>

            <BlurFade delay={0.6} inView>
              <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-patina shrink-0" aria-hidden="true">
                  <path d="M8 1L2 4v4c0 3.3 2.6 6.4 6 7 3.4-.6 6-3.7 6-7V4L8 1z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <path d="M5.5 8l2 2 3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Bring your own API key &mdash; your data stays yours
              </div>
            </BlurFade>

            <BlurFade delay={0.7} inView>
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>Ecosystem:</span>
                <span style={{ color: "oklch(0.30 0.015 65)" }}>Solana</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: "oklch(0.30 0.015 65)" }}>Coinbase x402</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: "oklch(0.30 0.015 65)" }}>Phantom</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ color: "oklch(0.30 0.015 65)" }}>Helius</span>
              </div>
            </BlurFade>
          </div>

          {/* Right: hero image */}
          <BlurFade delay={0.3} inView className="relative flex items-center justify-center lg:justify-end">
            <div className="relative w-full max-w-[560px]">
              <div
                className="absolute -inset-4 -z-10 rounded-2xl"
                style={{
                  background:
                    "radial-gradient(ellipse at center, oklch(0.68 0.155 52 / 0.12), transparent 70%)",
                }}
              />
              <Image
                src="/images/hero.webp"
                alt="Abstract molten metal flows converging into crystalline structures representing startup idea refinement"
                width={1920}
                height={1080}
                priority
                className="rounded-lg"
                style={{
                  boxShadow:
                    "0 4px 24px oklch(0.50 0.02 65 / 0.10), 0 0 0 1px oklch(0.88 0.012 75 / 0.4)",
                }}
              />
            </div>
          </BlurFade>
        </div>
      </section>

      {/* Traction strip — server-rendered, lives between hero and pipeline cards.
          Pulled in via the tractionSlot prop so app/page.tsx (server component)
          can read on-chain numbers without making this whole client component
          server-side. Falls through to nothing when slot not provided. */}
      {tractionSlot}

      {/* ============ SOCIAL PROOF METRICS ============ */}
      <section className="relative" style={{ background: "oklch(0.96 0.015 75)", borderTop: "1px solid oklch(0.88 0.015 75)", borderBottom: "1px solid oklch(0.88 0.015 75)" }}>
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-0 px-6 md:grid-cols-3">
          {SOCIAL_METRICS.map((metric, i) => (
            <BlurFade key={metric.label} delay={0.1 * i} inView>
              <div className={`flex flex-col items-center py-10 md:py-14 ${i < 2 ? "md:border-r" : ""}`} style={{ borderColor: "oklch(0.88 0.015 75)" }}>
                <div className="font-heading text-5xl font-bold tracking-tight text-foreground md:text-6xl">
                  <NumberTicker value={metric.value} delay={0.3 + i * 0.15} className="text-foreground" />
                  <span className="ml-1 text-ember">{metric.suffix}</span>
                </div>
                <p className="mt-3 text-sm font-medium tracking-widest text-muted-foreground uppercase">
                  {metric.label}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </section>

      {/* ============ PAIN POINTS SECTION ============ */}
      <section className="relative py-20 md:py-24">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 20% 80%, oklch(0.72 0.12 178 / 0.04), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-[1200px] px-6">
          <BlurFade delay={0.1} inView>
            <p className="text-sm font-medium uppercase tracking-widest text-patina">
              Sound familiar?
            </p>
            <h2 className="font-heading mt-3 text-3xl font-bold leading-[1.1] tracking-[-1.5px] text-foreground md:text-4xl lg:text-[49px]">
              The startup idea trap
            </h2>
          </BlurFade>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {variant.painPoints.map((pain, i) => {
              const painIcons = [
                // Compass / lost
                <svg key="compass" width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-ember" aria-hidden="true">
                  <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M14 8l-5.5 2.5L11 16l5.5-2.5L14 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15" />
                </svg>,
                // Question mark / uncertainty
                <svg key="question" width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-patina" aria-hidden="true">
                  <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8.5 8.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2.5 2-2.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="11" cy="16" r="0.75" fill="currentColor" />
                </svg>,
                // Clock / time wasted
                <svg key="clock" width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-spark" aria-hidden="true">
                  <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 6v5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>,
              ];
              const borderColors = [
                "oklch(0.62 0.155 52 / 0.20)",
                "oklch(0.70 0.12 178 / 0.20)",
                "oklch(0.78 0.155 75 / 0.20)",
              ];
              const bgColors = [
                "oklch(0.62 0.155 52 / 0.06)",
                "oklch(0.70 0.12 178 / 0.06)",
                "oklch(0.78 0.155 75 / 0.06)",
              ];
              return (
                <BlurFade key={i} delay={0.15 + i * 0.1} inView direction={i === 0 ? "left" : i === 2 ? "right" : "down"}>
                  <div
                    className="group relative h-full rounded-xl p-7 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
                    style={{
                      background: "oklch(1 0.005 85)",
                      boxShadow: `0 2px 12px oklch(0.50 0.02 65 / 0.06), 0 0 0 1px ${borderColors[i]}`,
                      borderTop: `3px solid ${borderColors[i]}`,
                    }}
                  >
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: bgColors[i] }}>
                      {painIcons[i]}
                    </div>
                    <p className="text-base leading-relaxed text-foreground/90 md:text-[17px]">
                      {pain}
                    </p>
                  </div>
                </BlurFade>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ PIPELINE / FEATURES SECTION ============ */}
      <section className="relative py-20 md:py-24">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.025]" aria-hidden="true">
          <filter id="feat-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#feat-noise)" />
        </svg>

        <div className="relative mx-auto max-w-[1200px] px-6">
          <BlurFade delay={0.1} inView>
            <div className="text-center">
              <p className="text-sm font-medium uppercase tracking-widest text-ember">
                The pipeline
              </p>
              <h2 className="font-heading mx-auto mt-3 max-w-2xl text-3xl font-bold leading-[1.1] tracking-[-1.5px] text-foreground md:text-4xl lg:text-[49px]">
                Three stages. One validated idea.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Each stage feeds the next. Raw market signals become polished, stress-tested startup concepts.
              </p>
            </div>
          </BlurFade>

          <div className="mt-14 space-y-16 lg:space-y-20">
            {PIPELINE_STAGES.map((stage, i) => {
              const isEven = i % 2 === 0;
              return (
                <BlurFade key={stage.key} delay={0.15} inView direction={isEven ? "left" : "right"}>
                  <div className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${isEven ? "" : "lg:[direction:rtl]"}`}>
                    {/* Text column */}
                    <div className={isEven ? "" : "lg:[direction:ltr]"}>
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                          style={{
                            background: `oklch(from var(--${stage.key}) l c h / 0.15)`,
                            color: `var(--${stage.key})`,
                          }}
                        >
                          {i + 1}
                        </span>
                        <h3 className={`font-heading text-2xl font-bold tracking-tight ${stage.colorClass} md:text-3xl`}>
                          {stage.title}
                        </h3>
                      </div>
                      <p className="font-heading mt-2 text-lg text-foreground/80 italic">
                        {stage.tagline}
                      </p>
                      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        {stage.description}
                      </p>
                    </div>

                    {/* Image column */}
                    <div className={`relative ${isEven ? "" : "lg:[direction:ltr]"}`}>
                      <MagicCard
                        className="rounded-xl overflow-hidden"
                        gradientFrom={stage.borderColor}
                        gradientTo="oklch(0.96 0.008 85)"
                        gradientColor="oklch(0.96 0.008 85 / 0.6)"
                      >
                        <Image
                          src={stage.image}
                          alt={stage.alt}
                          width={800}
                          height={600}
                          className="w-full rounded-lg"
                        />
                      </MagicCard>
                    </div>
                  </div>
                </BlurFade>
              );
            })}
          </div>

          {/* Pipeline connector line (desktop) */}
          <div className="pointer-events-none absolute left-1/2 top-[200px] hidden h-[calc(100%-300px)] w-px lg:block" style={{ background: "linear-gradient(180deg, oklch(0.60 0.14 178 / 0.25), oklch(0.58 0.155 52 / 0.25), oklch(0.72 0.155 75 / 0.25))" }} />
        </div>
      </section>

      {/* ============ FOR AI AGENTS — pay-per-call API ============ */}
      <section className="relative py-20 md:py-24">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 75% 30%, oklch(0.62 0.13 178 / 0.05), transparent 60%), radial-gradient(ellipse 50% 40% at 20% 70%, oklch(0.62 0.155 52 / 0.05), transparent 60%)`,
          }}
        />
        <div className="relative mx-auto max-w-[1100px] px-6">
          <BlurFade delay={0.1} inView>
            <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
              {/* Left: copy */}
              <div>
                <p className="text-sm font-medium uppercase tracking-widest text-ember">
                  For AI agents
                </p>
                <h2 className="font-heading mt-3 text-3xl font-bold leading-[1.1] tracking-[-1.5px] text-foreground md:text-4xl lg:text-[44px]">
                  AI agents pay AI agents.
                </h2>
                <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
                  Every endpoint is callable autonomously over HTTPS. No API keys, no
                  signups — agents pay <strong>per request</strong> in USDC on Solana via
                  the <a href="https://docs.cdp.coinbase.com/x402" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: ECO_TEAL }}>x402 protocol</a>.
                  Probe → <code className="rounded px-1.5 py-0.5 text-[0.85em]" style={{ background: "oklch(0.97 0.005 80)", boxShadow: "inset 0 0 0 1px oklch(0.90 0.012 75)" }}>402</code> → sign → 200. Settles in ~3 seconds.
                </p>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  We run these endpoints on a <strong>cost-effective LLM</strong> (MiniMax / Claude Sonnet) so the per-call price stays low. For agents that just need fresh signal, this is the right tier.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    href="/docs/x402"
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:brightness-105"
                    style={{
                      background: "oklch(0.62 0.155 52)",
                      color: "oklch(0.99 0.005 85)",
                      boxShadow: "0 2px 12px oklch(0.62 0.155 52 / 0.25)",
                    }}
                  >
                    Read the x402 spec →
                  </Link>
                  <Link
                    href="/docs/api"
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
                    style={{ background: "oklch(1 0.005 85)", color: "oklch(0.30 0.015 65)", boxShadow: "0 0 0 1px oklch(0.85 0.015 75)" }}
                  >
                    Agent API reference →
                  </Link>
                </div>

                {/* Done-For-You premium tier */}
                <div
                  className="mt-8 rounded-xl p-4"
                  style={{
                    background: `linear-gradient(135deg, oklch(0.78 0.155 75 / 0.10), oklch(0.62 0.155 52 / 0.06))`,
                    boxShadow: `inset 0 0 0 1px oklch(0.78 0.155 75 / 0.30)`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl" aria-hidden>✦</span>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "oklch(0.55 0.155 75)" }}>
                        Need top-quality output?
                      </div>
                      <h3 className="mt-1 font-heading text-base font-bold text-foreground">
                        Done-For-You: we run it on the best model.
                      </h3>
                      <p className="mt-1.5 text-sm text-muted-foreground" style={{ lineHeight: 1.55 }}>
                        Hand us the brief and we run the full pipeline on a <strong>top-tier LLM</strong> (Claude Opus 4.7 / GPT-5.5 Pro) with human review on top. Premium reports for the moments where quality matters more than per-call cost.
                      </p>
                      <Link
                        href="/pricing#done-for-you"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
                        style={{ color: "oklch(0.55 0.155 75)" }}
                      >
                        See Done-For-You pricing →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
              {/* Right: endpoint card */}
              <div
                className="rounded-xl p-5"
                style={{
                  background: "oklch(0.99 0.005 85)",
                  boxShadow: `0 0 0 1px oklch(0.88 0.015 75), 0 12px 32px -8px oklch(0.62 0.13 178 / 0.18)`,
                }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Live endpoints
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {[
                    { path: "GET /api/v1/scout/gaps", price: "$0.10" },
                    { path: "GET /api/v1/scout/brief", price: "$0.10" },
                    { path: "GET /api/v1/scout/pain-clusters", price: "$0.10" },
                    { path: "GET /api/v1/scout/trends", price: "$0.10" },
                    { path: "GET /api/v1/scout/keywords", price: "$0.05" },
                    { path: "POST /api/v1/forge/ideate", price: "$15" },
                  ].map((e) => (
                    <div
                      key={e.path}
                      className="flex items-center justify-between rounded-md px-2.5 py-2 font-mono"
                      style={{ background: "oklch(0.97 0.005 80)" }}
                    >
                      <span style={{ color: "oklch(0.30 0.015 65)" }}>{e.path}</span>
                      <span className="font-semibold tabular-nums" style={{ color: ECO_TEAL }}>{e.price}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px]" style={{ color: "oklch(0.50 0.02 65)" }}>
                  Idempotent by tx hash · Memo-bound to the request
                </div>
              </div>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* ============ PRICING CTA ============ */}
      <section className="relative py-16 md:py-20" style={{ background: "oklch(0.96 0.012 80)" }}>
        <div className="relative mx-auto max-w-[800px] px-6 text-center">
          <BlurFade delay={0.1} inView>
            <p className="text-sm font-medium uppercase tracking-widest text-spark">Pricing</p>
            <h2 className="font-heading mt-3 text-3xl font-bold leading-[1.1] tracking-[-1.5px] text-foreground md:text-4xl">
              Pay once. Built to last.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Bonding-curve pricing — earlier buyers pay less. Each tier comes with a
              365-day usage quota.{" "}
              <Link href="/terms" className="underline">Terms apply</Link>.
            </p>
            <Link href="/pricing" className="mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3 text-base font-semibold transition-all duration-200" style={{ background: "oklch(0.78 0.155 75)", color: "oklch(0.18 0.025 65)", boxShadow: "0 2px 12px oklch(0.78 0.155 75 / 0.3)" }}>
              See Pricing
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          </BlurFade>
        </div>
      </section>

      {/* ============ PROMISE / SOCIAL PROOF MARQUEE ============ */}
      <section className="relative py-20 md:py-24 overflow-hidden" style={{ background: "oklch(0.95 0.015 80)" }}>
        <div className="mx-auto max-w-[1200px] px-6">
          <BlurFade delay={0.1} inView>
            <div className="text-center">
              <h2 className="font-heading text-3xl font-bold leading-[1.1] tracking-[-1.5px] text-foreground md:text-4xl">
                {variant.promise}
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
                {variant.proof}
              </p>
            </div>
          </BlurFade>
        </div>

        {/* Scrolling marquee of capabilities */}
        <div className="mt-14">
          <Marquee pauseOnHover className="[--gap:2rem] [--duration:30s]">
            {[
              "Multi-agent debate system",
              "10 specialized AI agents",
              "Real-time streaming output",
              "BYOK \u2014 bring your own key",
              "Kill/RICE scoring",
              "Sector-specific scanning",
              "Verdict: APPROVED / CONDITIONAL / PIVOT OUT / REJECTED",
              "Export to Markdown + PDF",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-medium text-foreground whitespace-nowrap"
                style={{
                  background: "oklch(1 0.003 85)",
                  boxShadow: "0 2px 8px oklch(0.50 0.02 65 / 0.08), 0 0 0 1px oklch(0.85 0.015 75 / 0.5)",
                }}
              >
                <span className="h-2 w-2 rounded-full bg-ember" />
                {item}
              </div>
            ))}
          </Marquee>
          <Marquee reverse pauseOnHover className="mt-5 [--gap:2rem] [--duration:35s]">
            {[
              "RSS + Reddit + HN + GitHub Issues",
              "GPT-5.x \u00b7 Claude 4.x \u00b7 Gemini 3.x \u00b7 MiniMax",
              "Pay with USDC via x402 on Solana",
              "Phantom wallet + agent wallets",
              "Lifetime access \u00b7 365-day quota",
              "MVP roadmap generation",
              "Pain cluster identification",
              "$0.45\u2013$5.50 per pipeline run",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-medium text-foreground whitespace-nowrap"
                style={{
                  background: "oklch(1 0.003 85)",
                  boxShadow: "0 2px 8px oklch(0.50 0.02 65 / 0.08), 0 0 0 1px oklch(0.85 0.015 75 / 0.5)",
                }}
              >
                <span className="h-2 w-2 rounded-full bg-patina" />
                {item}
              </div>
            ))}
          </Marquee>
        </div>
      </section>

      {/* ============ URGENCY SECTION ============ */}
      <section className="relative py-20 md:py-24 overflow-hidden" style={{ background: "linear-gradient(135deg, oklch(0.96 0.025 52), oklch(0.97 0.015 75))" }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 70% 30%, oklch(0.62 0.155 52 / 0.06), transparent 60%), radial-gradient(ellipse 40% 40% at 20% 70%, oklch(0.78 0.155 75 / 0.05), transparent 50%)",
          }}
        />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03]" aria-hidden="true">
          <filter id="urgency-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#urgency-noise)" />
        </svg>

        <div className="relative mx-auto max-w-[800px] px-6 text-center">
          <BlurFade delay={0.1} inView>
            <div
              className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
              style={{ boxShadow: "0 0 0 1px oklch(0.78 0.155 75 / 0.4), 0 4px 12px oklch(0.78 0.155 75 / 0.08)", background: "oklch(1 0.005 85)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-spark" aria-hidden="true">
                <path d="M7 1v6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="text-sm font-medium text-spark">Limited</span>
            </div>
          </BlurFade>

          <BlurFade delay={0.2} inView direction="up">
            <h2 className="font-heading text-3xl font-bold leading-[1.1] tracking-[-1.5px] text-foreground md:text-4xl lg:text-[49px]">
              {variant.urgency}
            </h2>
          </BlurFade>

          <BlurFade delay={0.35} inView direction="up">
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
              The longer you wait to validate, the more time you invest in ideas that might not work. GapSmith gives you the answer in 2 hours, not 2 months.
            </p>
          </BlurFade>
        </div>
      </section>

      {/* ============ FINAL CTA SECTION ============ */}
      <section className="relative py-24 md:py-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 50%, oklch(0.78 0.155 75 / 0.08), transparent 60%), radial-gradient(ellipse 50% 50% at 25% 70%, oklch(0.62 0.155 52 / 0.06), transparent 50%), radial-gradient(ellipse 40% 40% at 75% 30%, oklch(0.70 0.12 178 / 0.05), transparent 50%)",
          }}
        />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03]" aria-hidden="true">
          <filter id="cta-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#cta-noise)" />
        </svg>

        <div className="relative mx-auto max-w-[700px] px-6 text-center">
          <BlurFade delay={0.1} inView direction="up">
            <Image
              src="/images/logo.svg"
              alt="GapSmith logo"
              width={64}
              height={64}
              className="mx-auto mb-8"
              style={{ filter: "drop-shadow(0 4px 12px oklch(0.62 0.155 52 / 0.15))" }}
            />
          </BlurFade>

          <BlurFade delay={0.2} inView direction="up">
            <h2 className="font-heading text-3xl font-bold leading-[1.08] tracking-[-1.5px] text-foreground md:text-4xl lg:text-[52px]">
              Stop guessing. Start validating.
            </h2>
          </BlurFade>

          <BlurFade delay={0.35} inView direction="up">
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
              Join founders who let AI agents argue about their ideas before spending a dime on building.
            </p>
          </BlurFade>

          <BlurFade delay={0.5} inView direction="up">
            <div className="mt-10 flex flex-col items-center gap-4">
              <Link href="/signup" onClick={handleCtaClick}>
                <ShimmerButton
                  shimmerColor="oklch(0.62 0.155 52)"
                  background="oklch(0.62 0.155 52)"
                  shimmerSize="0.05em"
                  className="px-12 py-5 text-lg font-semibold text-primary-foreground"
                >
                  {variant.cta}
                </ShimmerButton>
              </Link>
              <span className="text-sm text-muted-foreground">
                One-time purchase &middot; Bring your own API key
              </span>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* Footer rendered globally via SiteFooter in app/layout.tsx */}
    </div>
  );
}
