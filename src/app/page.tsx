import { DEFAULT_VARIANT } from "@/lib/variants";
import LandingPage from "@/app/v/[variant]/landing-client";
import { TractionStrip } from "@/app/_components/traction-strip";

// Server component (no "use client") — lets us server-render the traction
// strip with live on-chain data and embed it as a slot inside the otherwise
// client-rendered LandingPage.
export default function HomePage() {
  return <LandingPage variant={DEFAULT_VARIANT} tractionSlot={<TractionStrip />} />;
}
