import Link from "next/link";

const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.90 0.012 75)";
const PATINA = "oklch(0.62 0.13 178)";
const EMBER = "oklch(0.58 0.155 52)";

const COLS: Array<{ heading: string; links: Array<{ href: string; label: string; tag?: string; external?: boolean }> }> = [
  {
    heading: "Product",
    links: [
      { href: "/free-trial", label: "Free Trial", tag: "FREE" },
      { href: "/scout", label: "Scout" },
      { href: "/forge", label: "Forge" },
      { href: "/prove", label: "Prove" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    heading: "Documentation",
    links: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/pipelines", label: "Pipelines" },
      { href: "/docs/x402", label: "x402 on Solana", tag: "USP" },
      { href: "/docs/api", label: "Agent API" },
      { href: "/docs/done-for-you", label: "Done-For-You" },
      { href: "/lab/debate-room", label: "Debate Room", tag: "WIP" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/changelog", label: "Changelog" },
      { href: "/contact", label: "Contact" },
      { href: "https://solscan.io/account/BuBjMDp2B9dPxFHjWU4qWZBQKKWkAXoiPts2GWGN9Rbv", label: "Merchant wallet", external: true },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms & Conditions" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="mt-20 border-t"
      style={{ borderColor: BORDER, background: "oklch(0.97 0.01 85)" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Solana ecosystem strip — translated into the Workshop palette */}
        <div
          className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg p-3"
          style={{
            background: "oklch(0.96 0.018 178)",
            boxShadow: `inset 0 0 0 1px oklch(0.62 0.13 178 / 0.20)`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-12 rounded-full"
              style={{ background: `linear-gradient(135deg, ${PATINA}, ${EMBER})` }}
            />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: FG }}>
              Built on Solana
            </span>
          </div>
          <span className="text-xs" style={{ color: MUTED }}>
            x402 protocol · Phantom · Helius · Coinbase Developer Platform
          </span>
          <Link
            href="/docs/x402"
            className="ml-auto text-xs font-medium hover:underline underline-offset-2"
            style={{ color: PATINA }}
          >
            How it works →
          </Link>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {/* Brand col on lg */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 lg:row-span-1">
            <Link href="/" className="flex items-center gap-2">
              <span
                className="font-heading text-lg font-bold"
                style={{ color: FG, letterSpacing: "-0.5px" }}
              >
                GapSmith
              </span>
            </Link>
            <p className="mt-2 max-w-xs text-xs" style={{ color: MUTED, lineHeight: 1.55 }}>
              The AI venture builder where AI agents pay AI agents — Scout finds market
              gaps, Forge ideates, Prove debates. All on Solana via x402.
            </p>
          </div>

          {COLS.map((col) => (
            <div key={col.heading}>
              <div
                className="mb-3 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: MUTED, opacity: 0.85 }}
              >
                {col.heading}
              </div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      target={l.external ? "_blank" : undefined}
                      rel={l.external ? "noopener noreferrer" : undefined}
                      className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:underline"
                      style={{ color: FG }}
                    >
                      {l.label}
                      {l.tag && (
                        <span
                          className="rounded-full px-1 py-px text-[8px] font-bold uppercase tracking-wide"
                          style={{ background: PATINA, color: "white" }}
                        >
                          {l.tag}
                        </span>
                      )}
                      {l.external && <span aria-hidden style={{ opacity: 0.5 }}>↗</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Meta strip */}
        <div
          className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-[11px]"
          style={{ borderColor: BORDER, color: MUTED }}
        >
          <div>
            © {year} GapSmith. Operated under <Link href="/terms" className="underline">Terms & Conditions</Link>.
          </div>
          <div className="flex items-center gap-3">
            <a href="mailto:gapsmith@draftlabs.org" className="hover:underline">
              gapsmith@draftlabs.org
            </a>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Submitted to <a href="https://colosseum.com/frontier" className="underline" target="_blank" rel="noopener noreferrer">Solana Frontier 2026</a></span>
          </div>
        </div>
      </div>
    </footer>
  );
}
