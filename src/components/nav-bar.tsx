"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, Settings, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";

const DOCS_LINKS: Array<{ href: string; label: string; description: string; tag?: string }> = [
  { href: "/docs", label: "Overview", description: "Start here — what GapSmith is and how it works." },
  { href: "/docs/quickstart", label: "Quickstart", description: "Sign up, buy, run your first report in 5 minutes." },
  { href: "/docs/architecture", label: "Architecture", description: "System diagram + component breakdown." },
  { href: "/docs/pipelines", label: "Pipelines", description: "Scout / Forge / Prove deep-dive with cost benchmarks." },
  { href: "/docs/x402", label: "x402 on Solana", description: "Pay-per-call AI commerce — the protocol we built on.", tag: "USP" },
  { href: "/docs/api", label: "Agent API reference", description: "Endpoints, payment flow, code examples for AI agents." },
  { href: "/docs/done-for-you", label: "Done-For-You", description: "We run the pipeline on top-tier LLM with human review." },
];

function DocsDropdown({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openMenu() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = pathname.startsWith("/docs");

  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium hover:underline"
        style={{ color: isActive ? "oklch(0.62 0.155 52)" : undefined }}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Docs
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-lg p-1.5"
          style={{
            background: "white",
            boxShadow:
              "0 0 0 1px oklch(0.90 0.012 75), 0 12px 32px -8px rgba(0,0,0,0.12), 0 4px 12px -4px rgba(0,0,0,0.06)",
          }}
          role="menu"
        >
          {DOCS_LINKS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                role="menuitem"
                className="group block rounded-md px-3 py-2 transition-colors"
                style={{ background: active ? "oklch(from oklch(0.62 0.155 52) l c h / 0.06)" : "transparent" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "oklch(0.97 0.005 80)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = active
                    ? "oklch(from oklch(0.62 0.155 52) l c h / 0.06)"
                    : "transparent";
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: active ? "oklch(0.62 0.155 52)" : "oklch(0.24 0.012 65)" }}
                  >
                    {item.label}
                  </span>
                  {item.tag && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{
                        background: "oklch(0.62 0.13 178)",
                        color: "white",
                      }}
                    >
                      {item.tag}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "oklch(0.50 0.02 65)", lineHeight: 1.45 }}>
                  {item.description}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const desktopLinks = (
    <>
      <Link href="/scout" className="text-sm font-medium hover:underline">Scout</Link>
      <Link href="/forge" className="text-sm font-medium hover:underline">Forge</Link>
      <Link href="/prove" className="text-sm font-medium hover:underline">Prove</Link>
      <Link href="/pricing" className="text-sm font-medium hover:underline">Pricing</Link>
      <DocsDropdown pathname={pathname} />
    </>
  );

  // Mobile: flat list (no dropdown — just show all docs links)
  const mobileLinks = (
    <>
      <Link href="/scout" className="text-sm font-medium hover:underline">Scout</Link>
      <Link href="/forge" className="text-sm font-medium hover:underline">Forge</Link>
      <Link href="/prove" className="text-sm font-medium hover:underline">Prove</Link>
      <Link href="/pricing" className="text-sm font-medium hover:underline">Pricing</Link>
      <div className="mt-2 border-t pt-3" style={{ borderColor: "oklch(0.90 0.012 75)" }}>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Documentation
        </div>
        <div className="flex flex-col gap-2">
          {DOCS_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm font-medium hover:underline">
              {item.label}
              {item.tag && (
                <span
                  className="ml-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
                  style={{ background: "oklch(0.62 0.13 178)", color: "white" }}
                >
                  {item.tag}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </>
  );

  const authSection = loading ? (
    <Button variant="outline" disabled className="min-w-[70px]">
      &nbsp;
    </Button>
  ) : user ? (
    <>
      <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors" title="API Settings">
        <Settings className="h-4 w-4" />
      </Link>
      <Link
        href="/settings"
        title={user.email ?? "Account"}
        aria-label={user.email ? `Account ${user.email}` : "Account"}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-opacity hover:opacity-80"
        style={{
          background: "oklch(from oklch(0.62 0.13 178) l c h / 0.14)",
          color: "oklch(0.62 0.13 178)",
        }}
      >
        {(user.email?.[0] ?? "?").toUpperCase()}
      </Link>
      <Button variant="outline" onClick={handleLogout}>
        Log out
      </Button>
    </>
  ) : (
    <Link href="/login" className={buttonVariants({ variant: "outline" })}>
      Log in
    </Link>
  );

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/images/logo.svg" alt="GapSmith" width={32} height={32} />
        <span className="text-xl font-bold">GapSmith</span>
      </Link>
      {/* Desktop nav */}
      <div className="hidden md:flex items-center gap-4">
        {desktopLinks}
        {authSection}
      </div>
      {/* Mobile hamburger menu */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger
            aria-label="Open menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <div className="flex flex-col gap-4 mt-8">
              {mobileLinks}
              {authSection}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
