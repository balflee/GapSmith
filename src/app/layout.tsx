import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import Script from "next/script";
import { NavBar } from "@/components/nav-bar";
import { SiteFooter } from "@/components/site-footer";
import { RetainTracker } from "@/components/RetainTracker";
import "./globals.css";

// Google Ads tag (AW-*). Pageviews build remarketing audiences and pair
// with later conversion fires from trackTrialActivated() / pay_success.
// Production-only: loading in dev would pollute audience pool with our
// own testing traffic.
const GOOGLE_ADS_ID = "AW-18052705807";
const isProduction = process.env.NODE_ENV === "production";

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

        {/* Google Ads (gtag.js) — afterInteractive so it doesn't block
            initial render. Inline config script depends on the external
            loader having defined dataLayer, but next/script preserves
            ordering within the same strategy bucket. */}
        {isProduction && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-ads-gtag" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GOOGLE_ADS_ID}');
              `}
            </Script>
          </>
        )}

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
