/**
 * /changelog — Public changelog showing what's shipped recently. Hand-curated
 * from git log with the key user-visible / agent-visible changes per day.
 * Date headers descend; entries within a day are ordered by impact.
 *
 * Update by appending an entry to ENTRIES below when a commit lands that
 * a user/agent/judge would notice (silent refactors don't belong here).
 */

import Link from "next/link";

export const metadata = {
  title: "Changelog · GapSmith",
  description: "Recent shipped features and fixes on GapSmith.",
};

const FG = "oklch(0.24 0.012 65)";
const MUTED = "oklch(0.50 0.02 65)";
const BORDER = "oklch(0.85 0.012 65)";
const TAG_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  feature: { bg: "oklch(0.94 0.06 155)", fg: "oklch(0.32 0.14 155)", label: "Feature" },
  fix:     { bg: "oklch(0.94 0.06 25)",  fg: "oklch(0.42 0.18 25)",  label: "Fix" },
  api:     { bg: "oklch(0.94 0.06 240)", fg: "oklch(0.36 0.16 240)", label: "API" },
  docs:    { bg: "oklch(0.94 0.04 80)",  fg: "oklch(0.40 0.10 80)",  label: "Docs" },
  refactor:{ bg: "oklch(0.94 0.02 65)",  fg: "oklch(0.40 0.04 65)",  label: "Refactor" },
};

type Tag = keyof typeof TAG_COLORS;

interface Entry {
  date: string;          // ISO yyyy-mm-dd
  tag: Tag;
  title: string;         // one-liner
  detail?: string;       // optional deeper paragraph
  commit?: string;       // 7-char short SHA, links to github
}

const ENTRIES: Entry[] = [
  {
    date: "2026-05-14",
    tag: "fix",
    title: "Prove: \"PROCEED 2 / REJECT 0 → REJECTED\" no longer happens silently",
    detail:
      "Two changes ship together. (1) Engine: Challenger's hidden veto threshold was ≤4/10 in R2+, which fired even when both Analyst and Reviewer voted PROCEED — producing unexplainable REJECTED verdicts. Loosened to ≤3/10 (same as R1), reserving veto for clearly-bad market reads (1-3 / 10). (2) UI: the verdict card now shows the Challenger's score and a \"Veto triggered\" badge when relevant, plus a one-line explainer when the Challenger overrode the binary vote. Existing sessions render correctly after deploy — per-round Challenger score was always in the DB, just never surfaced.",
  },
  {
    date: "2026-05-13",
    tag: "feature",
    title: "Scout / Forge / Prove: leave the page, come back, runs are still there",
    detail:
      "Pipelines have always run in the background on Railway — but the browser was throwing away the session id when you left, so it felt like restarting. Now: dispatch pushes ?session=<id> into the URL (bookmark-able, refresh-able), \"Past Sessions\" rows for in-flight runs are clickable (\"Click to watch live\"), and stale links to /scout-report?id=X mid-run cleanly redirect to the live progress view instead of dead-ending on \"No Report Found\". Zero engine changes — pure UI wiring.",
    commit: "edf0a53",
  },
  {
    date: "2026-05-12",
    tag: "feature",
    title: "/lab/debate-room streams each agent reply as it lands",
    detail:
      "Lab debates now render message-by-message in real time — Proposer's bubble appears as soon as their LLM call returns, then Challenger's, then Analyst's — instead of dropping a whole round at once like Prove does. Auto-scrolls; sub-agent tool calls (Trend Scout / Benchmark Hunter / Evidence Hunter) thread indented under their parent persona. A typing pill at the bottom mirrors the engine's progress message so you know who's about to speak. Pivots /lab from \"watch the result\" to \"watch them argue.\"",
    commit: "303d39d",
  },
  {
    date: "2026-05-12",
    tag: "fix",
    title: "Lab debate room polish — clean topic header + actionable errors",
    detail:
      "Two annoyances on the live lab page fixed. (1) Pasting a long markdown idea brief no longer dumps the entire wall of text into the sticky header — we extract a real title (strip ##, **, #N: prefixes, cap at 120 chars). (2) When a run fails (OpenAI insufficient_quota, invalid key, model-not-found, rate limit, context overflow), the error card translates the litellm exception into a one-line user fix and names which persona's model triggered it (e.g. \"OpenAI quota exhausted on Challenger + Defender — top up or pick a different provider\"). Raw error stays available behind a collapsible for bug reports.",
    commit: "0ff03f4",
  },
  {
    date: "2026-05-11",
    tag: "feature",
    title: "/lab/debate-room/new — pick a different LLM per persona, BYOK",
    detail:
      "The big one: lab debates can now run each of the 6 personas on a different LLM. Claude Opus on Proposer, MiniMax on Challenger, Gemini Pro on Analyst, GPT-5.5 on Defender — or any combination, including all-same-model. Strict BYOK (your keys decrypted in-memory at dispatch, never logged); free for testing (no Prove quota consumed; runs land in a separate lab_sessions table so experiments don't pollute the production dataset). Sticky header shows per-persona model chips while running. Engine reuses the full Prove debate logic — same gates, same verdict YAML, same sub-agents — just with per-persona LLM bindings.",
    commit: "d7355eb",
  },
  {
    date: "2026-05-11",
    tag: "fix",
    title: "Forge + Prove waiting UX — honest time estimates + heartbeat",
    detail:
      "Forge previously said \"results in 20–40 seconds\" — accurate for MiniMax, misleading for Claude/Gemini with native search where Round 1 alone can run 1–8 minutes. Now: model-aware time estimate up front, plus a client-side activity heartbeat after 90s of no engine progress so the page never looks frozen during slow LLM calls. No more \"is it stuck or is it thinking?\" tickets.",
    commit: "878243b",
  },
  {
    date: "2026-05-07",
    tag: "fix",
    title: "Upstream LLM 5xx no longer eats your run quota",
    detail:
      "When the AI model provider (Gemini, Anthropic, MiniMax, etc.) returns a 503/429/connection error mid-pipeline, the engine now classifies it, refunds the quota unit you spent at /start, and surfaces a green \"Your run quota was NOT used — retry anytime\" badge in the run-page error card. Run failures from upstream outages cost you nothing. UI also recognizes 503 / \"service unavailable\" / connection errors directly (was generic \"Something Went Wrong\" before).",
    commit: "aacf908",
  },
  {
    date: "2026-05-07",
    tag: "fix",
    title: "Prove no longer false-rejects ADJUSTED debates",
    detail:
      "PIVOT_OUT detection moved from regex to a mandatory YAML verdict block (status: STRENGTHENED | ADJUSTED | VULNERABLE | PIVOT_OUT) the agent must emit. Three rounds of regex tightening upstream still couldn't handle every false-positive variant — a Defender stats-table row \"| 🔴 PIVOT_OUT | 0 |\" reporting zero pivots was triggering REJECTED on debates that were actually ADJUSTED. Verified end-to-end on MiniMax-M2.7 ($0.022 smoke).",
    commit: "3e41c59",
  },
  {
    date: "2026-05-07",
    tag: "feature",
    title: "Forge gets a fourth competitive category: RECONSTRUCT",
    detail:
      "Forge ideation Step 3 used a 3-category schema (BLUE_OCEAN / IMPROVABLE / RED_OCEAN) and Step 4 told Proposer to skip RED_OCEAN — which means Notion (vs Confluence), Linear (vs Jira), Stripe (vs PayPal) class opportunities were systematically filtered out. New RECONSTRUCT category surfaces ideas where the incumbent looks healthy but the Job-To-Be-Done has shifted underneath. Plus a \"why hasn't anyone done this?\" sanity gate on BLUE_OCEAN to catch survivor-bias wedges before debate kills them.",
    commit: "ce017ab",
  },
  {
    date: "2026-05-06",
    tag: "feature",
    title: "/lab/debate-room — visualized 6-persona Prove debate (WIP)",
    detail:
      "Microsoft-Teams-style chat replay of a real, paid mainnet Prove session. 6 AI personas with editorial-illustration avatars, phase progress (A → A.5 → B → C → D → vote), expandable sub-agent tool calls (Trend Scout / Benchmark Hunter / Evidence Hunter), verdict reveal with kill-brief banner. Read-only replay for now; mixed-model debates ship next.",
    commit: "37a63fd",
  },
  {
    date: "2026-05-06",
    tag: "feature",
    title: "Live mainnet traction strip on homepage",
    detail:
      "Verifiable on-chain numbers beneath the hero — sessions count, USDC settled, paid agent API calls — with a Solscan link to the merchant wallet. Honest small numbers preferred over vanity metrics.",
    commit: "c7186aa",
  },
  {
    date: "2026-05-05",
    tag: "feature",
    title: "/docs/api/playground — interactive API explorer",
    detail:
      "Pick any of the 7 endpoints, tweak query/body params via a form, and copy a runnable curl / Python / TypeScript snippet. Sample-response tab shows real production payloads (gaps, pain clusters, kill briefs) so judges and integrators can see actual output shapes without spending USDC.",
    commit: "c6b5d84",
  },
  {
    date: "2026-05-05",
    tag: "api",
    title: "PIVOT_OUT is now a distinct verdict on /api/v1/prove/debate",
    detail:
      "When a panelist self-declares the idea unsalvageable mid-debate, agents now see verdict=\"PIVOT_OUT\" instead of REJECTED — no more inspecting report.pivot_report to disambiguate. OpenAPI spec lists all four verdicts (APPROVED, CONDITIONAL_APPROVED, REJECTED, PIVOT_OUT) and which report.* field to read for each path.",
    commit: "dcd4886",
  },
  {
    date: "2026-05-05",
    tag: "fix",
    title: "Vote-rejected Prove now ships a Strategist kill brief, not silence",
    detail:
      "When the panel voted REJECTED via final tally (not via in-round PIVOT_OUT), the Strategist was never called and report.output / summary / analysis shipped empty. Now: dedicated kill-brief synthesis with top 3 reasons cited by persona/round, salvage paths, and 1-page decision summary. Verified by job_moskspum: 7045-char output (was 0).",
    commit: "9e45013",
  },
  {
    date: "2026-05-05",
    tag: "api",
    title: "POST /api/v1/prove/debate Compute API live ($25 USDC, ~60 min)",
    detail:
      "Closes the agent platform gap — Scout (Data) + Forge (Compute) + Prove (Compute) all paid in USDC over x402. Result payload: { verdict, report, rounds, votes }. Webhooks fire on completion.",
    commit: "81c40c2",
  },
  {
    date: "2026-05-05",
    tag: "fix",
    title: "Pre-payment body validation in withX402Payment",
    detail:
      "Agents posting an invalid body (wrong enum, missing field, type mismatch) now get 422 BEFORE the 402 advertisement. No USDC burned on requests that would be rejected after on-chain settlement.",
    commit: "08084ad",
  },
  {
    date: "2026-05-05",
    tag: "api",
    title: "Structured session_config object on /forge/ideate",
    detail:
      "Agents can now pass { profile, budget, timeline, revenue_threshold, founder_signal } with enum-validated values instead of hand-building SESSION_CONFIG.md. Markdown string form still accepted.",
    commit: "0e230fd",
  },
  {
    date: "2026-05-04",
    tag: "feature",
    title: "Forge → Prove SESSION_CONFIG inheritance",
    detail:
      "When Prove debates an idea generated by Forge, it now inherits the same project context (Profile/Budget/Timeline/Revenue) Forge ranked the idea under — keeping ratings internally consistent. Override toggle available.",
    commit: "8669cba",
  },
  {
    date: "2026-05-04",
    tag: "fix",
    title: "Forge screening: rank-1 always matches the WINNER badge",
    detail:
      "Six historical sessions had the lower-RICE idea promoted to rank-1 because the cascade tiebreaker disagreed with the simple summed-totals comparison the WINNER badge uses. Added a simple-max safety override + pair label↔total correctly post-reorder.",
    commit: "fd59f33",
  },
  {
    date: "2026-05-04",
    tag: "feature",
    title: "FACT_CLAIMS source-link rule enforced on Forge hard stats",
    detail:
      "Forge prompts now require every hard fact (competitor names + pricing, funding, ARR, contract status) to either cite an inline [REF: SEARCH] URL, tag as [assumption], or be deleted. Catches the 'fabricated competitor pricing' failure mode that surfaced in earlier Prove fact-checks.",
    commit: "024e3da",
  },
  {
    date: "2026-05-04",
    tag: "feature",
    title: "Default-expand Project Context card on Forge / Prove",
    detail:
      "Reduces the silent-defaults problem — most users hit Start without ever knowing the Profile/Budget/Timeline/Revenue knobs existed. Now visible by default; collapsing is one click for users who don't want it.",
    commit: "10c49db",
  },
  {
    date: "2026-05-04",
    tag: "fix",
    title: "Prove vote-condition deduplication (semantic-aware)",
    detail:
      "Multiple voters often arrived at the same gating condition with slightly different wording. dict.fromkeys() only caught byte-identical duplicates; the new normalized first-N-words signature catches paraphrases too. 1 production session retroactively cleaned.",
    commit: "e3f71cc",
  },
  {
    date: "2026-05-04",
    tag: "fix",
    title: "Stop leaking [SUB_AGENT_QUALITY_WARNING] into transcripts",
    detail:
      "The internal quality marker was meant as a downstream signal but ended up rendered to users on /prove-report. 6 historical sessions retroactively cleaned. Quality is now judged downstream from content alone.",
    commit: "1cd4973",
  },
  {
    date: "2026-05-04",
    tag: "feature",
    title: "SESSION_CONFIG threaded through Forge + Prove",
    detail:
      "Solo founders / Funded teams / Enterprise users can finally tell the engine their real Budget / Timeline / Team Profile / Revenue threshold instead of being silently rated against generic Small Team / $10K / $100K assumptions. LEAN_FIT bands are now proportional to the user's actual budget.",
    commit: "cecf836",
  },
  {
    date: "2026-04-30",
    tag: "feature",
    title: "GapSmith x402 agent platform — initial commit",
    detail:
      "Scout / Forge / Prove pipelines, x402 USDC payment rail, /api/v1/* agent API, /docs/api playground, examples/agent_demo.py reference impl. Live at gapsmith.draftlabs.org.",
    commit: "c514f60",
  },
];

const REPO = "https://github.com/balflee/GapSmith";

function Badge({ tag }: { tag: Tag }) {
  const t = TAG_COLORS[tag];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}
    >
      {t.label}
    </span>
  );
}

export default function ChangelogPage() {
  // Group by date (already sorted descending in ENTRIES)
  const byDate = new Map<string, Entry[]>();
  for (const e of ENTRIES) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 sm:py-16" style={{ color: FG }}>
      <header className="mb-10">
        <h1 className="font-heading text-4xl font-bold tracking-tight" style={{ letterSpacing: "-1.5px" }}>
          Changelog
        </h1>
        <p className="mt-3 text-base" style={{ color: MUTED, lineHeight: 1.6 }}>
          Hand-curated highlights of what we&apos;ve shipped on GapSmith — features
          users see, fixes that change observable behavior, and agent-API
          additions. Repository:{" "}
          <Link href={REPO} className="underline" style={{ color: FG }}>
            github.com/balflee/GapSmith
          </Link>.
        </p>
      </header>

      <div className="space-y-10">
        {Array.from(byDate.entries()).map(([date, entries]) => (
          <section key={date}>
            <h2
              className="font-heading text-sm font-bold uppercase tracking-wider mb-4 pb-2"
              style={{ color: MUTED, borderBottom: `1px solid ${BORDER}`, letterSpacing: "0.08em" }}
            >
              {new Date(date).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </h2>
            <ul className="space-y-5">
              {entries.map((e, i) => (
                <li key={i}>
                  <div className="flex items-start gap-3">
                    <Badge tag={e.tag} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold" style={{ color: FG, lineHeight: 1.45 }}>
                        {e.title}
                      </div>
                      {e.detail && (
                        <p className="mt-1 text-sm" style={{ color: MUTED, lineHeight: 1.6 }}>
                          {e.detail}
                        </p>
                      )}
                      {e.commit && (
                        <Link
                          href={`${REPO}/commit/${e.commit}`}
                          className="mt-1.5 inline-block font-mono text-xs underline"
                          style={{ color: MUTED }}
                        >
                          {e.commit}
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-16 pt-6 text-xs" style={{ color: MUTED, borderTop: `1px solid ${BORDER}` }}>
        For the complete history (including refactors and silent fixes),
        browse the{" "}
        <Link href={`${REPO}/commits/main`} className="underline" style={{ color: FG }}>
          full git log
        </Link>.
      </footer>
    </main>
  );
}
