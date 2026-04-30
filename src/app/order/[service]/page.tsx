import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderClient, type ServiceConfig } from "./order-client";

const SERVICES: Record<string, ServiceConfig> = {
  scout: {
    slug: "scout",
    label: "Scout Run",
    price: 39,
    color: "oklch(0.62 0.13 178)",
    turnaround: "24-48 hours",
    deliverable: "Full Scout report (PDF + interactive web view)",
    pitch:
      "We scan your target sectors, ingest fresh signals, score and cluster pain points, then synthesize a complete market-gap report — top-tier LLM (Claude Opus 4.7 / GPT-5.5 Pro) with a human pass for fact-checking and polish.",
    briefFields: [
      { key: "brief_sectors", label: "Target sectors", placeholder: "e.g. AI/ML, fintech, edtech (2-4 industries)", required: true, rows: 2 },
      { key: "brief_target_market", label: "Target market or buyer", placeholder: "Optional — e.g. Series A SaaS founders, mid-market e-commerce ops", required: false, rows: 2 },
      { key: "brief_constraints", label: "Constraints to honor", placeholder: "Optional — geography, regulation, team-size, budget cap", required: false, rows: 2 },
      { key: "brief_what_you_want", label: "What you want out", placeholder: "Optional — \"3 wedges to compare\", \"a deck-ready summary\", etc.", required: false, rows: 2 },
    ],
  },
  forge: {
    slug: "forge",
    label: "Forge Run",
    price: 99,
    color: "oklch(0.58 0.155 52)",
    turnaround: "48-72 hours",
    deliverable: "Top 3 ideas with 20 structured fields each + full multi-round transcript",
    pitch:
      "We run the 5-round multi-agent ideation against your gaps (Scout output or your own brief), with all 10 agents firing and a manual screening pass on top of the automated kill votes / RICE scores.",
    briefFields: [
      { key: "brief_idea", label: "Idea or pain to ideate around", placeholder: "What gap, market trend, or hypothesis do you want us to ideate against?", required: true, rows: 4 },
      { key: "brief_target_market", label: "Target market", placeholder: "Optional — who's the buyer?", required: false, rows: 2 },
      { key: "brief_constraints", label: "Constraints", placeholder: "Optional — geography, regulation, team-size, budget cap", required: false, rows: 2 },
      { key: "brief_what_you_want", label: "What you want out", placeholder: "Optional — \"top 3 ranked\", \"bias toward bootstrappable\", etc.", required: false, rows: 2 },
    ],
  },
  prove: {
    slug: "prove",
    label: "Prove Run",
    price: 149,
    color: "oklch(0.78 0.155 75)",
    turnaround: "48-72 hours",
    deliverable: "Verdict + reasoning + MVP roadmap + ROI breakdown + complete debate transcript",
    pitch:
      "Our most demanding pipeline — 10 agents debate your idea adversarially across multiple rounds, with Phase A5 fact-checking every claim against cited URLs and a human reviewer adjudicating before delivery.",
    briefFields: [
      { key: "brief_idea", label: "The idea to prove", placeholder: "150-300 words. What is it, who's it for, why now, what's the wedge?", required: true, rows: 6 },
      { key: "brief_target_market", label: "Target market", placeholder: "Optional — buyer, geography, segment specifics", required: false, rows: 2 },
      { key: "brief_constraints", label: "Constraints", placeholder: "Optional — capital, team, regulation", required: false, rows: 2 },
      { key: "brief_what_you_want", label: "What you want out", placeholder: "Optional — \"investor-ready verdict\", \"go/no-go for next 30 days\", etc.", required: false, rows: 2 },
    ],
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service } = await params;
  const cfg = SERVICES[service];
  if (!cfg) return { title: "Order — GapSmith" };
  return {
    title: `Order Done-For-You ${cfg.label} — GapSmith`,
    description: `${cfg.pitch} $${cfg.price} per run, ${cfg.turnaround}.`,
  };
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service } = await params;
  const cfg = SERVICES[service];
  if (!cfg) notFound();
  return <OrderClient service={cfg} />;
}
