/**
 * Canned API responses for the /docs/api/playground "View sample response"
 * button. Captured from real production runs and trimmed to representative
 * shapes — not synthetic data. Refresh periodically by re-running an actual
 * paid call against prod and pasting the result here.
 *
 * Keep these short enough that the playground stays snappy, but long enough
 * that the structure is clear (e.g., gaps include both trend_signal AND
 * pain_signals because that's the value-add Scout produces).
 */

export interface SampleResponse {
  status: number;
  body: unknown;
}

export const SAMPLES: Record<string, SampleResponse> = {
  "GET /api/v1/scout/gaps": {
    status: 200,
    body: {
      gaps: [
        {
          title: "AI Commerce Ops Copilot for Multi-Channel Sellers",
          trend_signal: {
            article: "Ecommerce Trends: What Anthropic, OpenAI and Google are each doing in agentic commerce",
            source: "Digital Commerce 360",
            score: 7.5,
            insight:
              "Agentic commerce is pushing buyers and sellers toward AI-mediated workflows, increasing the value of systems that orchestrate inventory, listings, orders, and exceptions across channels.",
          },
          pain_signals: [
            {
              theme: "Cross-channel commerce operations are fragile and expensive to run",
              severity: "critical",
              signal_count: 8,
              description:
                "Brands selling across Amazon, Shopify, Etsy struggle to keep inventory, orders, listings, and customer data synchronized.",
            },
            {
              theme: "Marketplace platforms lack flexible tools for complex seller and customer models",
              severity: "moderate",
              signal_count: 3,
              description:
                "Operators need richer controls for vendor onboarding, permissions, pricing, but off-the-shelf tools force workarounds.",
            },
          ],
          core_question:
            "Can we build an AI ops layer that watches every sales channel and predicts sync failures before they hit revenue?",
        },
        {
          title: "AI Agent Certification Layer for Enterprise Deployment",
          trend_signal: {
            article: "Enterprises ask: how do we trust AI agents with production access?",
            source: "TechCrunch",
            score: 8.1,
            insight:
              "Compliance teams have no standard rubric for evaluating agent safety before granting database/API write permissions.",
          },
          pain_signals: [
            {
              theme: "No standard certification for AI agents that touch production systems",
              severity: "critical",
              signal_count: 14,
              description:
                "Enterprises drag deployment timelines from 3 weeks to 9 months waiting for ad-hoc security reviews.",
            },
          ],
          core_question:
            "Can we build the SOC2-equivalent for AI agents — a third-party audit that satisfies enterprise compliance?",
        },
      ],
      count: 2,
      generatedFrom: "2026-05-05T02:29:53.162964+00:00",
      sector: "ai-ml",
    },
  },

  "GET /api/v1/scout/pain-clusters": {
    status: 200,
    body: {
      pain_clusters: [
        {
          id: "pc-001",
          theme: "Solo founders running headless e-commerce on Shopify struggle to debug abandoned-cart automation when Klaviyo flows fire on the wrong segment",
          trend: "rising",
          sector: "ecommerce",
          avg_score: 7.42,
          mention_count: 119,
          keyword_matches: ["klaviyo", "abandoned cart", "segment", "shopify"],
        },
        {
          id: "pc-002",
          theme: "ML engineers training fine-tunes on Modal need to compare run costs across providers but have no normalized benchmark",
          trend: "new",
          sector: "ai-ml",
          avg_score: 6.18,
          mention_count: 47,
          keyword_matches: ["modal", "fine-tune", "gpu cost", "benchmark"],
        },
      ],
      count: 2,
      generatedFrom: "2026-05-05T02:29:53.162964+00:00",
      sector: "ai-ml",
    },
  },

  "GET /api/v1/scout/trends": {
    status: 200,
    body: {
      trends: [
        {
          theme: "Enterprise agents need attestation, not just observability",
          articles_supporting: 14,
          peak_score: 8.4,
          first_seen: "2026-04-29",
          last_seen: "2026-05-05",
        },
        {
          theme: "Agentic commerce protocols (AP2, A2A) shifting marketplace economics",
          articles_supporting: 9,
          peak_score: 7.8,
          first_seen: "2026-05-01",
          last_seen: "2026-05-05",
        },
      ],
      count: 2,
      windowDays: 7,
    },
  },

  "GET /api/v1/scout/keywords": {
    status: 200,
    body: {
      keywords: [
        { term: "agent attestation", frequency: 47, sector: "ai-ml", trend: "rising" },
        { term: "ap2 protocol", frequency: 31, sector: "fintech", trend: "new" },
        { term: "klaviyo segments", frequency: 28, sector: "ecommerce", trend: "stable" },
        { term: "modal gpu cost", frequency: 22, sector: "ai-ml", trend: "rising" },
      ],
      count: 4,
      sector: "ai-ml",
    },
  },

  "POST /api/v1/forge/ideate": {
    status: 202,
    body: {
      jobId: "job_mosedota_okg0v6iy",
      status: "pending",
      statusUrl: "/api/v1/jobs/job_mosedota_okg0v6iy",
      etaMinutes: 35,
      forgeSessionId: "f3a9b2e0-1c4d-4e8b-a7d6-9c2e3f5a1b8d",
    },
  },

  "POST /api/v1/prove/debate": {
    status: 202,
    body: {
      jobId: "job_moskspum_ife1w561",
      status: "pending",
      statusUrl: "/api/v1/jobs/job_moskspum_ife1w561",
      etaMinutes: 60,
      proveSessionId: "8f1e2d3c-4b5a-6789-9012-345678abcdef",
    },
  },

  "GET /api/v1/jobs/{id}": {
    status: 200,
    body: {
      jobId: "job_moskspum_ife1w561",
      endpoint: "/api/v1/prove/debate",
      status: "completed",
      progressPct: 100,
      etaMinutes: 0,
      result: {
        verdict: "REJECTED",
        report: {
          model: "MiniMax-M2.7",
          output: "# Kill Brief: AgentMeter\n\n## Why This Was Rejected\n\n1. Fabricated market sizing collapses the business case (Reviewer, Phase A.5 → Challenger, Phase B)...\n[... 7045 chars total ...]",
          summary: "## 1-Page Decision Brief\n\n### Verdict\nREJECTED — Four funded competitors occupy the space with free tiers...\n[... 2476 chars total ...]",
          analysis: "...",
          pivot_report: null,
          vote_summary: {
            vote_counts: { REJECT: 1, PROCEED: 1, CONDITIONAL: 0 },
            conditions: [
              "Prove willingness-to-pay through early pilot LOIs from 5+ developers who experienced runaway costs",
              "Achieve ≥15% free-to-paid conversion within 3 months of launch or pivot GTM strategy",
            ],
            total_voters: 2,
          },
        },
        rounds: 2,
        votes: { /* ... */ },
        session_id: "8f1e2d3c-4b5a-6789-9012-345678abcdef",
        model: "MiniMax-M2.7",
      },
      error: null,
      txHash: "Xp1iYD2XeBKJE4AUdqsUFzCUErfYdfgCURViJHaCTRS2izw4XPudAkAgQ3pdG2JQJobR3ZwdkyzJCpYFUQgDesN",
      createdAt: "2026-05-05T17:53:00.000Z",
      completedAt: "2026-05-05T18:30:48.000Z",
    },
  },
};
