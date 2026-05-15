"use client";

/**
 * /free-trial — Google Ads landing page.
 *
 * Conversion-optimized: minimal nav (logo only), single CTA above the
 * fold, 3-step explainer beneath, FAQ at the bottom. The hero signup form
 * calls Supabase signUp() directly with emailRedirectTo pointing back to
 * /auth/callback?next=/scout — once the user clicks the email confirm
 * link, the trigger from migration 019 grants 1 Scout + 1 Forge + 1 Prove
 * trial quota and the user lands on /scout ready to run.
 *
 * Why a separate page instead of using /signup or homepage:
 * - Google Ads Quality Score is sensitive to message-match between ad and
 *   landing page; a dedicated /free-trial lets us A/B variants and craft
 *   copy that exactly mirrors the ad.
 * - Homepage has navigation to Lab, Docs, Agent API, Pricing — every link
 *   is a chance for a paid visitor to wander off without converting.
 *   This page strips all of that.
 * - Conversion rate of dedicated LP vs homepage on paid traffic is
 *   typically 2-5x in our cost band.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { trackSignupStart, trackSignupComplete } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlurFade } from "@/components/ui/blur-fade";

// Mainnet Prove session that ships as a public showcase. Used for the
// "See a real debate →" link so visitors can verify the product is real
// before signing up. (Same session linked from /lab/debate-room.)
const SAMPLE_PROVE_SESSION_ID = "7e5b4b12-6a6c-4f7b-849e-11c8fec6c3c6";

const PATINA = "#3db5a6";
const EMBER = "#d4743c";
const SOLANA_GRADIENT = `linear-gradient(135deg, ${PATINA}, ${EMBER})`;
const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const SOFT_BG = "oklch(0.985 0.005 80)";

function getSiteOrigin(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.startsWith("http")) return envUrl.replace(/\/$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}

export default function FreeTrialPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  useEffect(() => {
    trackSignupStart({ method: "email" });
  }, []);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      // After clicking the confirm-email link the user lands on /scout —
      // by that point the email_verified trigger has fired and their 3
      // trial runs are already provisioned.
      options: { emailRedirectTo: `${getSiteOrigin()}/auth/callback?next=/scout` },
    });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    // Supabase quirk: returning `identities: []` means "user already exists,
    // password reset will be required" — surface that explicitly.
    if (data.user?.identities?.length === 0) {
      setError("An account with this email already exists. Try logging in instead.");
      return;
    }
    if (!data.session) {
      // Email confirmation required (normal path when "Confirm email" is on).
      setConfirmationSent(true);
      return;
    }
    // Confirmation already happened (e.g. magic link reuse) — straight to /scout.
    trackSignupComplete({ method: "email" });
    router.push("/scout");
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: SOFT_BG, color: FG }}>
      {/* ===== Minimal sticky header — logo only, no nav. ===== */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          background: "oklch(0.985 0.005 80 / 92%)",
          borderColor: BORDER,
        }}
      >
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <Link href="/free-trial" className="flex items-center gap-2 font-semibold" style={{ color: FG }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: SOLANA_GRADIENT }} />
            GapSmith
          </Link>
          <Link href="/login" className="text-xs font-medium hover:underline" style={{ color: MUTED }}>
            Already have an account? Log in
          </Link>
        </div>
      </header>

      {/* ===== Hero — headline + signup form side-by-side on desktop ===== */}
      <section className="mx-auto max-w-5xl w-full px-6 py-12 sm:py-20 grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">
        <BlurFade delay={0}>
          <div>
            <span
              className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-5"
              style={{ background: `${PATINA}20`, color: PATINA }}
            >
              Free trial · No credit card
            </span>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-heading)", letterSpacing: "-2px", lineHeight: 1.05 }}
            >
              Validate your startup idea with{" "}
              <span style={{ background: SOLANA_GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                6 AI agents
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg max-w-xl" style={{ color: MUTED, lineHeight: 1.6 }}>
              Sign up and immediately get one free run of each pipeline:
              spot a market gap, generate ideas, and stress-test your best
              one in a multi-agent debate. Reports stay yours — read them
              forever, even after the free runs are used up.
            </p>
            <div className="mt-6 flex items-center gap-4 text-xs flex-wrap" style={{ color: MUTED }}>
              <span>🔬 Real AI runs · not a demo</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>📨 Email verification only</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>💳 Card asked only if you upgrade later</span>
            </div>
          </div>
        </BlurFade>

        <BlurFade delay={0.1}>
          {/* ===== Signup form card ===== */}
          <div
            className="rounded-2xl p-6 sm:p-8"
            style={{
              background: "white",
              boxShadow: `0 8px 40px rgba(0,0,0,0.06), inset 0 0 0 1px ${BORDER}`,
            }}
          >
            {confirmationSent ? (
              <div className="text-center py-6">
                <div
                  className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{ background: `${PATINA}18`, color: PATINA }}
                >
                  ✉
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                  Check your inbox
                </h2>
                <p className="text-sm mb-1" style={{ color: MUTED, lineHeight: 1.55 }}>
                  We sent a confirmation link to{" "}
                  <span className="font-medium" style={{ color: FG }}>{email}</span>.
                </p>
                <p className="text-sm" style={{ color: MUTED, lineHeight: 1.55 }}>
                  Click the link to unlock your 3 free runs. Didn&apos;t arrive in 2 minutes? Check spam, or{" "}
                  <button
                    onClick={() => { setConfirmationSent(false); setEmail(""); setPassword(""); }}
                    className="underline font-medium"
                    style={{ color: PATINA }}
                  >
                    try a different email
                  </button>.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
                    Claim your 3 free runs
                  </h2>
                  <p className="text-xs" style={{ color: MUTED }}>
                    Confirm your email and they unlock instantly.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-wide font-semibold" style={{ color: MUTED }}>
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wide font-semibold" style={{ color: MUTED }}>
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8+ characters"
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="text-sm rounded-md px-3 py-2" style={{
                    background: "oklch(0.55 0.2 25 / 8%)",
                    color: "oklch(0.45 0.18 25)",
                  }}>
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full text-sm font-semibold"
                  style={{
                    background: SOLANA_GRADIENT,
                    color: "white",
                    boxShadow: `0 4px 16px ${EMBER}40`,
                  }}
                >
                  {loading ? "Creating account…" : "Claim my 3 free runs →"}
                </Button>

                <p className="text-[11px] text-center" style={{ color: MUTED, lineHeight: 1.5 }}>
                  By signing up you agree to the{" "}
                  <Link href="/terms" className="underline">Terms</Link>.
                  We use your email only to verify the account and send run notifications.
                </p>
              </form>
            )}
          </div>
        </BlurFade>
      </section>

      {/* ===== 3-step explainer ===== */}
      <section className="mx-auto max-w-5xl w-full px-6 py-12 sm:py-16 border-t" style={{ borderColor: BORDER }}>
        <BlurFade delay={0}>
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px" }}>
              How your 3 runs work
            </h2>
            <p className="mt-2 text-sm" style={{ color: MUTED }}>
              Three pipelines, designed to chain. Use them in any order.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <StepCard
              num={1}
              title="Scout"
              tagline="Find market gaps"
              desc="Multi-agent scan over RSS news + community pain signals across the sector you pick. Outputs ranked gaps, pain clusters, and a daily executive brief."
              accent="oklch(0.55 0.16 155)"
            />
            <StepCard
              num={2}
              title="Forge"
              tagline="Generate ideas"
              desc="5-round Proposer-vs-Defender brainstorm grounded in your Scout report (or freeform context). Outputs top 3 ideas with RICE + Kill scores."
              accent="oklch(0.62 0.155 52)"
            />
            <StepCard
              num={3}
              title="Prove"
              tagline="Stress-test the winner"
              desc="6-persona AI debate that grills your idea on viability, market, and execution. Outputs a verdict (proceed / pivot / kill) with consensus reasoning."
              accent="oklch(0.60 0.14 85)"
            />
          </div>
          <div className="mt-8 text-center">
            <Link
              href={`/prove-report?id=${SAMPLE_PROVE_SESSION_ID}`}
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              style={{ color: PATINA }}
            >
              See a real Prove debate report →
            </Link>
          </div>
        </BlurFade>
      </section>

      {/* ===== FAQ ===== */}
      <section className="mx-auto max-w-3xl w-full px-6 py-12 sm:py-16 border-t" style={{ borderColor: BORDER }}>
        <BlurFade delay={0}>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-6" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-0.5px" }}>
            Common questions
          </h2>
          <dl className="space-y-5">
            <Faq
              q="What happens after my 3 free runs are used?"
              a="Your reports stay viewable forever. To run more, you can buy a tier on /pricing — Scout starts at $X for X runs/year. No surprise charges; no auto-billing."
            />
            <Faq
              q="Whose AI keys are used during the trial?"
              a="Ours. We run trial sessions on a company-funded MiniMax key, so you don't need to sign up for any AI provider first. If you upgrade to a paid tier you can BYOK (bring your own key) for any provider — Anthropic, OpenAI, Google, MiniMax."
            />
            <Faq
              q="Are the runs real or just a demo?"
              a="Real. Every Scout, Forge, and Prove run goes through the same engine our paid users have, hits the same APIs, writes the same reports to the same database. The only difference vs a paid run is the LLM key source and the 1-run cap."
            />
            <Faq
              q="How long does each run take?"
              a="Scout: 5–15 minutes. Forge: 15–35 minutes. Prove: 30–60 minutes. All run in the background — close the tab and come back, you won't lose progress."
            />
            <Faq
              q="What's stored about me?"
              a="Email + hashed password (Supabase Auth standard). Run inputs and outputs are stored under your account so you can return to them. We don't sell or share data; see the Terms for full detail."
            />
          </dl>
        </BlurFade>
      </section>

      {/* ===== Final CTA ===== */}
      <section className="mx-auto max-w-3xl w-full px-6 py-12 sm:py-16 border-t text-center" style={{ borderColor: BORDER }}>
        <BlurFade delay={0}>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-heading)", letterSpacing: "-1px" }}>
            Ready in 60 seconds.
          </h2>
          <p className="mt-2 text-sm mb-6" style={{ color: MUTED }}>
            Email + password. Confirm. Run.
          </p>
          <a
            href="#top"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold"
            style={{
              background: SOLANA_GRADIENT,
              color: "white",
              boxShadow: `0 4px 16px ${EMBER}40`,
            }}
          >
            ↑ Sign up at the top
          </a>
        </BlurFade>
      </section>

      {/* ===== Footer — minimal ===== */}
      <footer className="mt-auto border-t" style={{ borderColor: BORDER }}>
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs flex items-center justify-between flex-wrap gap-2" style={{ color: MUTED }}>
          <span>© {new Date().getFullYear()} GapSmith</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/contact" className="hover:underline">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------------
// Step card for the "How your 3 runs work" section.
// ----------------------------------------------------------------------
function StepCard({
  num, title, tagline, desc, accent,
}: { num: number; title: string; tagline: string; desc: string; accent: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "white",
        boxShadow: `inset 0 0 0 1px ${BORDER}`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: `${accent}18`, color: accent }}
        >
          {num}
        </span>
        <div>
          <div className="font-bold" style={{ color: FG, fontFamily: "var(--font-heading)" }}>{title}</div>
          <div className="text-[11px] uppercase tracking-wide font-medium" style={{ color: accent }}>{tagline}</div>
        </div>
      </div>
      <p className="text-sm" style={{ color: MUTED, lineHeight: 1.55 }}>{desc}</p>
    </div>
  );
}

// ----------------------------------------------------------------------
// FAQ row.
// ----------------------------------------------------------------------
function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-semibold text-sm" style={{ color: FG }}>{q}</dt>
      <dd className="mt-1 text-sm" style={{ color: MUTED, lineHeight: 1.6 }}>{a}</dd>
    </div>
  );
}
