"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import { trackSignupStart } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BlurFade } from "@/components/ui/blur-fade";

/* ---------- OAuth handler ---------- */
function getSiteOrigin(): string {
  // Prefer build-time env var (set on Railway to https://gapsmith.draftlabs.org).
  // Falls back to runtime origin only if env is missing — avoids stale window
  // origins from PWA installs / service workers / odd browser states.
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.startsWith("http")) return envUrl.replace(/\/$/, "");
  return window.location.origin;
}

async function handleOAuthLogin(provider: "google") {
  trackSignupStart({ method: provider });
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${getSiteOrigin()}/auth/callback?next=/settings` },
  });
}

/* ---------- SVG icons for OAuth providers ---------- */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

/* ---------- Skeleton loader ---------- */
function FormSkeleton() {
  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
        <div className="h-7 w-28 rounded bg-muted animate-pulse" />
      </div>
      <Card
        className="border-0 bg-card backdrop-blur-xl"
        style={{ boxShadow: "0 0 0 1px oklch(0.88 0.015 75 / 0.6), 0 4px 24px oklch(0.50 0.02 65 / 0.08)" }}
      >
        <CardContent className="p-6">
          <div className="space-y-5 animate-pulse">
            <div className="space-y-2">
              <div className="h-4 w-12 rounded bg-muted" />
              <div className="h-11 rounded-md bg-muted" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-16 rounded bg-muted" />
              <div className="h-11 rounded-md bg-muted" />
            </div>
            <div className="h-11 rounded-full bg-muted" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Login form (uses useSearchParams, needs Suspense) ---------- */
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmed = searchParams.get("confirmed") === "true";
  const authError = searchParams.get("error") === "auth";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (loginError) {
      setError(loginError.message);
      return;
    }
    router.push("/settings");
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteOrigin()}/auth/callback?next=/auth/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setForgotSent(true);
  }

  return (
    <div className="w-full max-w-[420px]">
      <BlurFade delay={0} duration={0.5}>
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link href="/" className="group flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <Image
              src="/images/logo.svg"
              alt="GapSmith"
              width={36}
              height={36}
              className="transition-transform duration-300 group-hover:scale-105"
            />
            <span
              className="font-heading text-2xl font-bold tracking-tight"
              style={{ letterSpacing: "-1.5px", lineHeight: "1.08" }}
            >
              GapSmith
            </span>
          </Link>
        </div>
      </BlurFade>

      <BlurFade delay={0.08} duration={0.5}>
        <Card
          className="relative overflow-hidden border-0 bg-card backdrop-blur-xl"
          style={{
            boxShadow:
              "0 0 0 1px oklch(0.88 0.015 75 / 0.6), 0 4px 24px oklch(0.50 0.02 65 / 0.08), 0 0 30px oklch(0.68 0.155 52 / 0.06)",
          }}
        >
          {/* Subtle top gradient accent line */}
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, oklch(0.68 0.155 52 / 0.5), oklch(0.84 0.145 85 / 0.4), transparent)",
            }}
          />

          <CardHeader className="space-y-1.5 pb-2 pt-8 text-center">
            <CardTitle
              className="font-heading text-2xl font-bold"
              style={{ letterSpacing: "-1.5px", lineHeight: "1.08" }}
            >
              {forgotMode ? "Reset password" : "Welcome back"}
            </CardTitle>
            <CardDescription className="text-muted-foreground" style={{ lineHeight: "1.55" }}>
              {forgotMode
                ? "Enter your email and we'll send a reset link"
                : "Sign in to continue your discovery"}
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-8 pt-4">
            {/* Status banners */}
            {confirmed && (
              <BlurFade delay={0} duration={0.3}>
                <div
                  className="mb-4 rounded-md px-3 py-2 text-center text-sm font-medium"
                  style={{
                    background: "oklch(0.65 0.16 155 / 0.1)",
                    color: "oklch(0.68 0.16 155)",
                  }}
                >
                  Email confirmed! Please log in.
                </div>
              </BlurFade>
            )}
            {authError && (
              <BlurFade delay={0} duration={0.3}>
                <div
                  className="mb-4 rounded-md px-3 py-2 text-center text-sm font-medium"
                  style={{
                    background: "oklch(0.55 0.22 25 / 0.1)",
                    color: "oklch(0.62 0.20 25)",
                  }}
                >
                  Authentication failed. Please try logging in.
                </div>
              </BlurFade>
            )}

            {forgotMode ? (
              forgotSent ? (
                <BlurFade delay={0} duration={0.4}>
                  <div className="space-y-4 text-center">
                    <div
                      className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                      style={{ background: "oklch(0.65 0.16 155 / 0.15)" }}
                    >
                      <svg
                        className="h-6 w-6"
                        style={{ color: "oklch(0.68 0.16 155)" }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <p
                      className="font-medium"
                      style={{ color: "oklch(0.68 0.16 155)" }}
                    >
                      Check your email for a reset link.
                    </p>
                    <Button
                      variant="ghost"
                      type="button"
                      className="text-sm text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/50"
                      onClick={() => {
                        setForgotMode(false);
                        setForgotSent(false);
                      }}
                    >
                      Back to login
                    </Button>
                  </div>
                </BlurFade>
              ) : (
                <>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium">
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="h-11 border-0 bg-input/50 text-base transition-all duration-200 placeholder:text-muted-foreground/50 focus:bg-input/80 focus:ring-2 focus:ring-primary/20"
                        style={{ borderRadius: "6px" }}
                      />
                    </div>
                    {error && (
                      <BlurFade delay={0} duration={0.3}>
                        <p
                          className="rounded-md px-3 py-2 text-sm"
                          style={{
                            background: "oklch(0.55 0.22 25 / 0.1)",
                            color: "oklch(0.62 0.20 25)",
                          }}
                        >
                          {error}
                        </p>
                      </BlurFade>
                    )}
                    <Button
                      type="submit"
                      disabled={loading}
                      className="h-11 w-full text-base font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                      style={{ borderRadius: "9999px" }}
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 animate-spin"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <circle cx="12" cy="12" r="10" className="opacity-25" />
                            <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                          </svg>
                          Sending...
                        </span>
                      ) : (
                        "Send reset link"
                      )}
                    </Button>
                  </form>
                  <Button
                    variant="ghost"
                    type="button"
                    className="mt-3 w-full text-sm text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/50"
                    onClick={() => {
                      setForgotMode(false);
                      setError("");
                    }}
                  >
                    Back to login
                  </Button>
                </>
              )
            ) : (
              <>
                {/* OAuth buttons */}
                <div className="flex flex-col gap-2.5">
                  <Button
                    variant="outline"
                    type="button"
                    className="h-11 w-full gap-3 border-0 text-base font-medium transition-all duration-200 hover:bg-muted/80"
                    style={{
                      boxShadow: "0 0 0 1px oklch(0.92 0.015 85 / 0.08)",
                      borderRadius: "8px",
                    }}
                    onClick={() => handleOAuthLogin("google")}
                  >
                    <GoogleIcon />
                    Continue with Google
                  </Button>
                </div>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/50" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-3 text-muted-foreground">
                      Or continue with email
                    </span>
                  </div>
                </div>

                {/* Email/password form */}
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm font-medium">
                      Email
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 border-0 bg-input/50 text-base transition-all duration-200 placeholder:text-muted-foreground/50 focus:bg-input/80 focus:ring-2 focus:ring-primary/20"
                      style={{ borderRadius: "6px" }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 border-0 bg-input/50 text-base transition-all duration-200 placeholder:text-muted-foreground/50 focus:bg-input/80 focus:ring-2 focus:ring-primary/20"
                      style={{ borderRadius: "6px" }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      type="button"
                      className="h-auto px-0 py-0 text-sm text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/50"
                      onClick={() => {
                        setForgotMode(true);
                        setError("");
                      }}
                    >
                      Forgot password?
                    </Button>
                  </div>

                  {error && (
                    <BlurFade delay={0} duration={0.3}>
                      <p
                        className="rounded-md px-3 py-2 text-sm"
                        style={{
                          background: "oklch(0.55 0.22 25 / 0.1)",
                          color: "oklch(0.62 0.20 25)",
                        }}
                      >
                        {error}
                      </p>
                    </BlurFade>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-11 w-full text-base font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                    style={{ borderRadius: "9999px" }}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <circle cx="12" cy="12" r="10" className="opacity-25" />
                          <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                        </svg>
                        Logging in...
                      </span>
                    ) : (
                      "Log in"
                    )}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </BlurFade>

      <BlurFade delay={0.16} duration={0.5}>
        <p className="mt-6 text-center text-sm text-muted-foreground" style={{ lineHeight: "1.55" }}>
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
          >
            Sign up
          </Link>
        </p>
      </BlurFade>
    </div>
  );
}

/* ---------- Page export with Suspense boundary ---------- */
export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* Background atmosphere: radial ember glow */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden="true"
      >
        <div
          className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.08]"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.155 52 / 0.35) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full opacity-[0.05]"
          style={{
            background:
              "radial-gradient(circle, oklch(0.72 0.12 178 / 0.3) 0%, transparent 70%)",
          }}
        />
        {/* Noise grain overlay */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.03]" aria-hidden="true">
          <filter id="login-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#login-noise)" />
        </svg>
      </div>

      <Suspense fallback={<FormSkeleton />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
