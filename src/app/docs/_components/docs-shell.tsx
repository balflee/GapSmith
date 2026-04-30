import Link from "next/link";
import type { ReactNode } from "react";

/* Solana ecosystem accent — translated into Workshop palette.
   Tokens kept under SOLANA_* names so consumers don't need to re-import.
   Hex form is used so `${SOLANA_PURPLE}40` hex-alpha patterns continue to produce valid CSS. */
const SOLANA_PURPLE = "#3db5a6"; // Patina (teal) — anchors ecosystem chrome
const SOLANA_GREEN = "#d4743c";  // Ember (orange) — bridges to brand action
const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const ACCENT = "oklch(0.62 0.155 52)";

const NAV: Array<{ section: string; items: Array<{ href: string; label: string; tag?: string }> }> = [
  {
    section: "Introduction",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/quickstart", label: "Quickstart" },
    ],
  },
  {
    section: "How it works",
    items: [
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/pipelines", label: "Pipelines" },
      { href: "/docs/x402", label: "x402 on Solana", tag: "USP" },
    ],
  },
  {
    section: "Services",
    items: [
      { href: "/docs/api", label: "Agent API reference" },
      { href: "/docs/done-for-you", label: "Done-For-You" },
    ],
  },
];

export function DocsShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "oklch(0.98 0.008 85)" }}>
      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-10 lg:py-14">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-10">
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-2 text-xs font-medium"
              style={{ color: MUTED }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})` }}
              />
              GapSmith
            </Link>

            <nav className="space-y-6">
              {NAV.map((group) => (
                <div key={group.section}>
                  <div
                    className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: MUTED, opacity: 0.85 }}
                  >
                    {group.section}
                  </div>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = active === item.href;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="group flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors"
                            style={{
                              color: isActive ? FG : MUTED,
                              background: isActive ? `oklch(from ${ACCENT} l c h / 0.08)` : "transparent",
                              fontWeight: isActive ? 600 : 500,
                              boxShadow: isActive ? `inset 2px 0 0 ${ACCENT}` : "none",
                            }}
                          >
                            <span>{item.label}</span>
                            {item.tag && (
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                                style={{
                                  background: `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`,
                                  color: "white",
                                }}
                              >
                                {item.tag}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            <div
              className="mt-10 rounded-lg p-3 text-xs"
              style={{ background: `oklch(from ${ACCENT} l c h / 0.06)`, boxShadow: `inset 0 0 0 1px ${BORDER}` }}
            >
              <div className="font-semibold" style={{ color: FG }}>
                Live on mainnet
              </div>
              <div className="mt-1" style={{ color: MUTED, lineHeight: 1.5 }}>
                Pay with USDC via Phantom or your AI agent&apos;s SPL wallet. No subscription.
              </div>
              <Link
                href="/pricing"
                className="mt-2 inline-block text-xs font-medium"
                style={{ color: ACCENT }}
              >
                See pricing →
              </Link>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export const DOCS_TOKENS = {
  SOLANA_PURPLE,
  SOLANA_GREEN,
  SOLANA_GRADIENT: `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`,
  FG,
  MUTED,
  BORDER,
  ACCENT,
  CODE_BG: "oklch(0.97 0.005 80)",
};

export function DocsHero({
  eyebrow,
  title,
  subtitle,
  badge,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div className="mb-10">
      {(eyebrow || badge) && (
        <div className="mb-3 flex items-center gap-2">
          {eyebrow && (
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: ACCENT }}>
              {eyebrow}
            </span>
          )}
          {badge && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`,
                color: "white",
              }}
            >
              {badge}
            </span>
          )}
        </div>
      )}
      <h1
        className="font-heading text-4xl font-bold tracking-tight md:text-5xl"
        style={{ color: FG, letterSpacing: "-1.5px", lineHeight: 1.1 }}
      >
        {title}
      </h1>
      <p className="mt-4 text-base" style={{ color: MUTED, lineHeight: 1.65 }}>
        {subtitle}
      </p>
    </div>
  );
}

export function Takeaway({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-8 rounded-lg p-4"
      style={{
        background: `oklch(from ${ACCENT} l c h / 0.06)`,
        boxShadow: `inset 0 0 0 1px oklch(from ${ACCENT} l c h / 0.18)`,
      }}
    >
      <div
        className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: ACCENT }}
      >
        Takeaway
      </div>
      <p className="text-sm" style={{ color: FG, lineHeight: 1.6 }}>
        {children}
      </p>
    </div>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-14 mb-4 font-heading text-2xl font-bold tracking-tight"
      style={{ color: FG, letterSpacing: "-1px", scrollMarginTop: 80 }}
    >
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mt-8 mb-2 font-heading text-lg font-bold"
      style={{ color: FG, letterSpacing: "-0.3px", scrollMarginTop: 80 }}
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-sm" style={{ color: FG, lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

export function MutedP({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-sm" style={{ color: MUTED, lineHeight: 1.65 }}>
      {children}
    </p>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul
      className="mt-3 list-disc space-y-2 pl-5 text-sm"
      style={{ color: FG, lineHeight: 1.65 }}
    >
      {children}
    </ul>
  );
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol
      className="mt-3 list-decimal space-y-2 pl-5 text-sm"
      style={{ color: FG, lineHeight: 1.65 }}
    >
      {children}
    </ol>
  );
}

export function CodeBlock({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="mt-4">
      {lang && (
        <div
          className="rounded-t-lg px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider"
          style={{ background: "#0a0a0a", color: "#9ca3af", borderBottom: "1px solid #1f2937" }}
        >
          {lang}
        </div>
      )}
      <pre
        className="overflow-x-auto p-4 text-xs leading-relaxed"
        style={{
          background: "#0a0a0a",
          color: "#e8e8e8",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          borderRadius: lang ? "0 0 0.5rem 0.5rem" : "0.5rem",
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 text-[0.85em] font-mono"
      style={{
        background: "oklch(0.97 0.005 80)",
        color: FG,
        boxShadow: `inset 0 0 0 1px ${BORDER}`,
      }}
    >
      {children}
    </code>
  );
}

export function Card({
  title,
  description,
  href,
  tag,
}: {
  title: string;
  description: string;
  href: string;
  tag?: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl p-5 transition-all hover:translate-y-[-1px]"
      style={{
        background: "white",
        boxShadow: `0 0 0 1px ${BORDER}, 0 1px 2px rgba(0,0,0,0.02)`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-base font-bold" style={{ color: FG, letterSpacing: "-0.3px" }}>
          {title}
        </h3>
        {tag && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{
              background: `linear-gradient(135deg, ${SOLANA_PURPLE}, ${SOLANA_GREEN})`,
              color: "white",
            }}
          >
            {tag}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm" style={{ color: MUTED, lineHeight: 1.55 }}>
        {description}
      </p>
      <div
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium transition-transform group-hover:translate-x-0.5"
        style={{ color: ACCENT }}
      >
        Read
        <span aria-hidden>→</span>
      </div>
    </Link>
  );
}

export function PrevNext({
  prev,
  next,
}: {
  prev?: { href: string; label: string };
  next?: { href: string; label: string };
}) {
  return (
    <div className="mt-16 grid gap-3 border-t pt-8 sm:grid-cols-2" style={{ borderColor: BORDER }}>
      {prev ? (
        <Link
          href={prev.href}
          className="group rounded-lg p-3 transition-colors hover:bg-white"
          style={{ boxShadow: `inset 0 0 0 1px ${BORDER}` }}
        >
          <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>← Previous</div>
          <div className="mt-1 font-heading text-sm font-semibold" style={{ color: FG }}>{prev.label}</div>
        </Link>
      ) : <div />}
      {next ? (
        <Link
          href={next.href}
          className="group rounded-lg p-3 text-right transition-colors hover:bg-white"
          style={{ boxShadow: `inset 0 0 0 1px ${BORDER}` }}
        >
          <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Next →</div>
          <div className="mt-1 font-heading text-sm font-semibold" style={{ color: FG }}>{next.label}</div>
        </Link>
      ) : <div />}
    </div>
  );
}
