"use client";

import { DEFAULT_VARIANT } from "@/lib/variants";
import LandingPage from "@/app/v/[variant]/landing-client";

export default function HomePage() {
  return <LandingPage variant={DEFAULT_VARIANT} />;
}
