import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
import { SiteFooter } from "@/components/site-footer";
import { RetainTracker } from "@/components/RetainTracker";
import "./globals.css";

const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gapsmith.draftlabs.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "From Market Signal to Validated Startup Idea in 2 Hours | GapSmith",
  description:
    "AI agents scan trends, brainstorm ideas, then debate and stress-test them — so you don't waste months on bad bets. Bring your own API key.",
  openGraph: {
    title: "From Market Signal to Validated Startup Idea in 2 Hours | GapSmith",
    description:
      "AI agents scan trends, brainstorm ideas, then debate and stress-test them — so you don't waste months on bad bets. Bring your own API key.",
    type: "website",
    url: siteUrl,
  },
};

const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GapSmith",
  description:
    "AI-powered startup idea discovery and validation platform with Scout, Forge, and Prove pipeline.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* Safe: hardcoded JSON-LD with no user input */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        <NavBar />
        <RetainTracker />
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
