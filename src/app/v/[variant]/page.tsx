import type { Metadata } from "next";
import { getVariant, getVariantSlugs } from "@/lib/variants";
import { notFound } from "next/navigation";
import LandingPage from "./landing-client";

export function generateStaticParams() {
  return getVariantSlugs().map((slug) => ({ variant: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ variant: string }>;
}): Promise<Metadata> {
  const { variant: slug } = await params;
  const variant = getVariant(slug);
  if (!variant) return {};
  return {
    title: `${variant.headline} | GapSmith`,
    description: variant.subheadline,
    openGraph: {
      title: `${variant.headline} | GapSmith`,
      description: variant.subheadline,
    },
  };
}

export default async function VariantPage({
  params,
}: {
  params: Promise<{ variant: string }>;
}) {
  const { variant: slug } = await params;
  const variant = getVariant(slug);
  if (!variant) notFound();
  return <LandingPage variant={variant} />;
}
