"""
Debate Runner (Prove) — full parity with CLI pipeline/debate_runner.py.

Orchestration:
- MAX_ROUNDS = 3
- Phase A: Trend Scout (sub-agent) → Proposer (with optional KB read R2+)
- Phase A.5: Reviewer fact-check (+ hallucination correction R2+)
- Phase B: Challenger (3 gated steps) + Analyst (3 gated steps + Benchmark Hunter) +
           Contrarian (sub-agent) + Gap Finder (sub-agent) + Reviewer (conditional, 2 gated steps)
- Phase C: Defender (2 gated steps + Evidence Hunter)
- Phase D: 2+1 voting (Challenger score hidden veto, Analyst+Reviewer binary, Strategist arbitration)
- Strategist: 2-phase (analysis + plan) with LOGIC_BLOCKED mini-round recovery
- Pivot detection after A/B/C (handles PIVOT_OUT / DIRECTION_CHANGE)

Uses LiteLLM + Tavily (no Claude Code subprocess).
"""

from __future__ import annotations

import asyncio
import json
import re
import traceback
from datetime import datetime, timezone

from engine.core.providers import Providers
from engine.core.debate_state import DebateState
from engine.core import debate_context as ctx
from engine.core import debate_consensus as cons
from engine.core import debate_helpers as helpers
from engine.core import debate_personas as personas
from engine.core import validators as V

MAX_ROUNDS = 3


# ============================================================
# Phase A — Proposer (+ Trend Scout sub-agent)
# ============================================================

async def run_phase_a(state: DebateState, providers: Providers, on_progress=None) -> str:
    """Phase A: Trend Scout → Proposer (with optional KB read R2+)."""
    state.current_phase = "A"
    idea = state.idea

    # Sub-agent: Trend Scout (competitive intelligence)
    prev_proposer = state.get_output(state.current_round - 1, "A", "proposer") if state.current_round > 1 else ""
    summary = (prev_proposer or idea)[:1500]
    tags = ", ".join(state.tags) if state.tags else ""

    trend_scout_data = ""
    try:
        ts_resp = await helpers.call_sub_agent(
            providers,
            ctx.build_trend_scout_prompt(idea, summary, tags),
            system_prompt=personas.TREND_SCOUT_SYSTEM,
            max_tokens=2048,
            validator=V.validate_trend_scout,
        )
        trend_scout_data = ts_resp.content
        state.set_sub_agent(state.current_round, "trend_scout", trend_scout_data)
    except Exception as e:
        print(f"[PROVE] Trend Scout failed (continuing): {e}", flush=True)

    # KB Read (R2+)
    kb_context = ""
    if state.current_round > 1:
        kb_prev = state.kb_get_round(state.current_round - 1)
        if kb_prev:
            kb_lines = []
            for agent, content in kb_prev.items():
                if content:
                    kb_lines.append(f"### R{state.current_round - 1} — {agent.title()}\n{content[:1500]}")
            if kb_lines:
                kb_context = "\n\n".join(kb_lines)

    # Main: Proposer
    prompt = ctx.build_phase_a_prompt(state, None)
    if trend_scout_data:
        prompt += f"\n\n## 🔭 Trend Scout Competitive Search Results\n\nIncorporate these findings into your analysis:\n\n{trend_scout_data}"
    if kb_context:
        prompt += f"\n\n## 📖 Key Data from Previous Round (KB)\n\n{kb_context}"

    resp = await helpers.call_with_gate(
        providers, prompt, V.validate_proposer,
        system_prompt=personas.PROPOSER_SYSTEM,
        max_tokens=4096,
        min_length=helpers.MIN_MAIN_AGENT_LEN,
    )
    output = resp.content
    state.set_output(state.current_round, "A", "proposer", output)
    state.append_discussion(state.current_round, "A", "proposer", output)
    state.kb_store(state.current_round, "proposer", output)

    return output


# ============================================================
# Phase A.5 — Reviewer fact-check
# ============================================================

async def run_phase_a5(state: DebateState, providers: Providers, proposer_output: str) -> str:
    """Phase A.5: Reviewer fact-checks Proposer. R2+ includes hallucination correction loop."""
    state.current_phase = "A5"

    prompt = ctx.build_phase_a5_prompt(state, None, proposer_output)
    resp = await helpers.call_with_gate(
        providers, prompt, V.validate_fact_check_reviewer,
        system_prompt=personas.REVIEWER_SYSTEM,
        max_tokens=3072,
    )
    factcheck = resp.content
    state.set_output(state.current_round, "A5", "reviewer", factcheck)
    state.append_discussion(state.current_round, "A5", "reviewer", factcheck)

    # Hallucination correction for Round 2+
    if state.current_round >= 2:
        flags = cons.check_hallucination_flags(factcheck)
        state.hallucination_flags[state.current_round] = flags
        if flags:
            correction_prompt = ctx.build_hallucination_correction_prompt(state, flags)
            corr_resp = await providers.llm.call(
                prompt=correction_prompt, model=providers.model,
                system_prompt=personas.PROPOSER_SYSTEM,
                max_tokens=2048,
            )
            state.set_output(state.current_round, "A5_correction", "proposer", corr_resp.content)
            state.append_discussion(state.current_round, "A5_correction", "proposer", corr_resp.content)

    return factcheck


# ============================================================
# Phase B — Challenger (gated), Analyst (gated + Benchmark Hunter),
#           Reviewer (conditional gated), Contrarian, Gap Finder (sub-agents)
# ============================================================

async def _run_challenger_gated(state: DebateState, providers: Providers) -> str:
    """Challenger Phase B: 3 gated steps."""
    proposer_output = state.get_output(state.current_round, "A", "proposer") or ""
    factcheck = state.get_output(state.current_round, "A5", "reviewer") or ""

    # Step 1: Competitor search
    step1_prompt = f"""Round {state.current_round} / Phase B / Step 1: Competitor Search

Search for direct competitors of the Proposer's plan.

--- PROPOSER PLAN ---
{proposer_output[:3000]}
--- END ---

Strategy:
- "[feature described by Proposer] SaaS / tool / platform"
- "[target user] solutions"
- Product Hunt / G2 / Capterra for related categories
- Search "[one-line description]" directly

For each competitor found:
- Name + one-liner
- Pricing (specific numbers, search pricing pages)
- Core features (3-5 bullets)
- User complaints/reviews
- Source: [REF: SEARCH] URL

If none found, explain what you searched and where.
Return as markdown."""
    step1 = await helpers.call_with_gate(
        providers, step1_prompt,
        V.validate_competitor_search,
        system_prompt=personas.CHALLENGER_SYSTEM,
        max_tokens=3072,
    )

    # Step 2: Counter evidence
    step2_prompt = f"""Round {state.current_round} / Phase B / Step 2: Counter-Evidence Search

Competitor search results:
{step1.content[:3000]}

Proposer plan:
{proposer_output[:2000]}

Now search for counter-evidence (data that refutes or stress-tests the plan):
1. Similar project failures: "[similar concept] failed startup / shutdown / post-mortem"
2. Market data challenges: "[industry] market size" + "[industry] growth slowing"
3. User behavior reality: "[target action] conversion rate" + "[similar product] churn rate"

For each finding: explain what it means for the Proposer's plan.
Return as markdown."""
    step2 = await helpers.call_with_gate(
        providers, step2_prompt,
        V.validate_counter_evidence,
        system_prompt=personas.CHALLENGER_SYSTEM,
        max_tokens=3072,
    )

    # Step 3: Final challenge
    direction_check = ""
    if state.current_round > 1:
        prev_proposer = state.get_output(state.current_round - 1, "A", "proposer") or ""
        direction_check = f"""
⚠️ Direction-Change Detection (Round 2+ only):

Previous round Proposer plan:
{prev_proposer[:1000]}

Current round Proposer plan:
{proposer_output[:1000]}

If you believe the current Proposer plan is no longer the same idea (core value prop, target user, or business model fundamentally changed), declare at the start:

🔴 DIRECTION_CHANGE: [explain which core elements changed and why this is a direction shift, not adjustment]

Declaring DIRECTION_CHANGE ends the debate. Only declare if truly changed. Parameter tweaks, pricing, user refinement are NOT direction changes.
"""

    step3_prompt = f"""Round {state.current_round} / Phase B / Step 3: Synthesized Challenge

Based on competitor search and counter-evidence, generate the final challenge.

Competitor search:
{step1.content[:3000]}

Counter-evidence:
{step2.content[:3000]}

Fact-check:
{factcheck[:2000]}
{direction_check}

Requirements:
- Challenges must be specific and data-backed (cite competitors/data you found)
- Evaluate Proposer's anticipated responses
- Produce Must-Answer Checklist (3-5 core questions Defender MUST answer)
- Final: `Challenger Score: X/10` + `Verdict: viable / questionable / dead`

Return as markdown.

**Critical**: Carry through at least 3 competitor/evidence URLs from Step 1 + Step 2 search results
as inline citations (`[REF: SEARCH] URL` or bare URL). Unsourced challenges are not credible."""
    step3 = await helpers.call_with_gate(
        providers, step3_prompt, V.validate_challenger_final,
        system_prompt=personas.CHALLENGER_SYSTEM,
        max_tokens=4096,
        use_search=False,  # already have step1 + step2 inline
    )

    return step3.content


async def _run_analyst_gated(state: DebateState, providers: Providers) -> tuple[str, str]:
    """Analyst Phase B: Benchmark Hunter (parallel) + 3 gated steps. Returns (final_analysis, benchmark_data)."""
    proposer_output = state.get_output(state.current_round, "A", "proposer") or ""
    idea = state.idea

    # Sub-agent: Benchmark Hunter (runs in parallel with Step 1)
    benchmark_task = helpers.call_sub_agent(
        providers,
        ctx.build_benchmark_hunter_prompt(idea, proposer_output),
        system_prompt=personas.BENCHMARK_HUNTER_SYSTEM,
        max_tokens=2048,
        validator=V.validate_benchmark_hunter,
    )

    # Step 1: Pricing benchmarks
    step1_prompt = f"""Round {state.current_round} / Phase B / Step 1: Pricing Benchmarks

--- PROPOSER PLAN ---
{proposer_output[:3000]}
--- END ---

Search competitor and industry pricing:
- "[competitor] pricing" (pricing page)
- "[category] SaaS pricing benchmark"
- "[competitor] ARPU / revenue per user"
- "[category] average contract value"
- "[industry] customer acquisition cost benchmark"

Output: at least 2 competitors with specific pricing + source URLs.
Return as markdown."""
    step1 = await helpers.call_with_gate(
        providers, step1_prompt,
        V.validate_pricing_data,
        system_prompt=personas.ANALYST_SYSTEM,
        max_tokens=3072,
    )

    # Await Benchmark Hunter
    benchmark_data = ""
    try:
        bh_resp = await benchmark_task
        benchmark_data = bh_resp.content
        state.set_sub_agent(state.current_round, "benchmark_hunter", benchmark_data)
    except Exception as e:
        print(f"[PROVE] Benchmark Hunter failed: {e}", flush=True)

    # Step 2: Cost structure
    benchmark_section = f"\n\n🎯 Benchmark Hunter Results:\n{benchmark_data[:3000]}" if benchmark_data else ""
    cost_context = ""
    if state.session_config:
        cost_context = f"\nSession Config:\n{state.session_config}\nCost coefficient reference: Web SaaS 1.0x / Mobile 1.5-2.0x / CLI 0.5x / Browser Extension 0.7x"

    step2_prompt = f"""Round {state.current_round} / Phase B / Step 2: Cost Structure

Proposer plan:
{proposer_output[:2000]}

Pricing benchmarks:
{step1.content[:3000]}
{cost_context}{benchmark_section}

Search and estimate MVP costs:
- "[tech stack] pricing" (Vercel, AWS, Supabase, etc.)
- "[needed API] pricing per request"
- "[AI model] API cost per token"
- "[third-party service] pricing"

Output: categorized cost list + amount per item + source + total (with 10-15% buffer).
MVP budget cap: ~$10K | Team: 4-5 people | Validation: 4-8 weeks.
Return as markdown."""
    step2 = await helpers.call_with_gate(
        providers, step2_prompt,
        V.validate_cost_structure,
        system_prompt=personas.ANALYST_SYSTEM,
        max_tokens=3072,
    )

    # Step 3: Final analysis (gated on citation quality — must cite pricing/benchmark sources)
    benchmark_for_step3 = benchmark_data[:3000] if benchmark_data else ""
    session_block = f"\n\nSession Config:\n{state.session_config}\n" if state.session_config else ""
    step3_prompt = f"""Round {state.current_round} / Phase B / Step 3: Final Financial Analysis

Based on pricing benchmarks and cost structure, complete the full analysis.

Pricing benchmarks (from your search + Benchmark Hunter):
{step1.content[:3000]}
{benchmark_for_step3}

Cost structure (from your search):
{step2.content[:3000]}{session_block}

Complete:
1. Lean Feasibility: 🟢 LEAN_FIT / 🟡 STRETCH / 🔴 NOT_LEAN
2. Revenue model (at least 2 scenarios: pessimistic/base, with estimation logic)
3. ROI + break-even: 🟢 HIGH_ROI / 🟡 MED_ROI / 🔴 LOW_ROI
4. Critical assumptions (3-5 "if wrong, conclusion changes" items)
5. Final verdict: VIABLE / MARGINAL / NOT_VIABLE

Year-1 revenue threshold: use `SESSION_CONFIG.Revenue_threshold` if provided in the Session Config block above (e.g. Solo $30K/yr, Founder Couple $50K/yr); otherwise default $100K/yr. Below threshold = LOW_ROI.

**Critical**: Every competitor price, every cost estimate, every market data point
MUST have an inline citation — use `[REF: SEARCH] URL` (URLs are in the search
results above). Unsourced numbers are not acceptable.

Return as markdown."""
    step3 = await helpers.call_with_gate(
        providers, step3_prompt, V.validate_analyst_final,
        system_prompt=personas.ANALYST_SYSTEM,
        max_tokens=4096,
        use_search=False,  # already have step1 + benchmark + step2 inline
    )

    return step3.content, benchmark_data


async def _run_reviewer_gated(state: DebateState, providers: Providers) -> str:
    """Reviewer Phase B assumption attack: 2 gated steps."""
    proposer_output = state.get_output(state.current_round, "A", "proposer") or ""
    analyst_output = state.get_output(state.current_round, "B", "analyst") or ""

    step1_prompt = f"""Round {state.current_round} / Phase B / Step 1: Reverse-Evidence Search

Use reverse-search: specifically look for signals that "assumption X doesn't hold."

--- PROPOSER PLAN ---
{proposer_output[:3000]}
--- END ---

--- ANALYST ANALYSIS (low-confidence assumptions) ---
{analyst_output[:2000]}
--- END ---

For each core assumption:
- "Users will pay" → search "[similar product] free alternative / open source"
- "X weeks to MVP" → search "[similar product] development time"
- "Market growing" → search "[market] decline / slowing / saturation"
- "No regulatory barriers" → search "[industry] regulation / compliance [region]"

Each result: what you found + URL + what it means for the assumption.
Return as markdown."""
    step1 = await helpers.call_with_gate(
        providers, step1_prompt,
        V.validate_reverse_search,
        system_prompt=personas.REVIEWER_SYSTEM,
        max_tokens=3072,
    )

    step2_prompt = f"""Round {state.current_round} / Phase B / Step 2: Assumption Attack Synthesis

Based on reverse-evidence search, generate formal assumption attacks.

Search results:
{step1.content[:3000]}

Requirements:
- At least 3 assumption attacks, each including:
  🔴 Assumption Attack #N
  - Assumption: "[attacked assumption]"
  - Attack: "If it doesn't hold..."
  - Evidence: [reverse evidence + URL]
  - Verification method + cost/time
  - Severity: 🔴 fatal / 🟡 important / 🟢 minor

- At least 2 edge cases

- Final verdict: HOLD / CONDITIONAL / PROCEED

**Critical**: Each assumption attack MUST cite inline reverse-evidence URLs
(`[REF: SEARCH] URL`) from your Step 1 search results above. An assumption attack
without a source is just an opinion. At least 2 URLs required.

Return as markdown."""
    step2 = await helpers.call_with_gate(
        providers, step2_prompt, V.validate_reviewer_attack,
        system_prompt=personas.REVIEWER_SYSTEM,
        max_tokens=4096,
        use_search=False,  # already have step 1 search results inline
    )

    return step2.content


async def run_phase_b(state: DebateState, providers: Providers, config: dict | None = None) -> dict:
    """Phase B: Challenger + Analyst + Contrarian + Gap Finder (parallel), + optional Reviewer."""
    state.current_phase = "B"
    outputs: dict[str, str] = {}

    proposer_output = state.get_output(state.current_round, "A", "proposer") or ""
    idea = state.idea

    # Launch all parallel tasks
    challenger_task = _run_challenger_gated(state, providers)
    analyst_task = _run_analyst_gated(state, providers)

    contrarian_task = helpers.call_sub_agent(
        providers,
        ctx.build_contrarian_prompt(idea, proposer_output),
        system_prompt=personas.CONTRARIAN_SYSTEM,
        max_tokens=2048,
        validator=V.validate_contrarian,
    )
    gap_finder_task = helpers.call_sub_agent(
        providers,
        ctx.build_gap_finder_prompt(idea, proposer_output),
        system_prompt=personas.GAP_FINDER_SYSTEM,
        max_tokens=2048,
        validator=V.validate_gap_finder,
    )

    reviewer_triggered = cons.should_trigger_reviewer_attack(state, config or {})
    state.reviewer_attack_triggered = reviewer_triggered
    reviewer_task = _run_reviewer_gated(state, providers) if reviewer_triggered else None

    # Gather
    tasks = [challenger_task, analyst_task, contrarian_task, gap_finder_task]
    names = ["challenger", "analyst_tuple", "contrarian", "gap_finder"]
    if reviewer_task:
        tasks.append(reviewer_task)
        names.append("reviewer")

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for name, r in zip(names, results):
        if isinstance(r, Exception):
            print(f"[PROVE] Phase B {name} failed: {r}", flush=True)
            state.error_log.append(f"Phase B {name}: {r}")
            if name == "analyst_tuple":
                outputs["analyst"] = f"[ERROR] {r}"
                outputs["_benchmark_hunter"] = ""
            else:
                outputs[name] = f"[ERROR] {r}" if name in ("challenger", "reviewer") else ""
        else:
            if name == "analyst_tuple":
                analyst_result, benchmark_data = r
                outputs["analyst"] = analyst_result
                outputs["_benchmark_hunter"] = benchmark_data
            elif name in ("contrarian", "gap_finder"):
                outputs[name] = r.content
                state.set_sub_agent(state.current_round, name, r.content)
            else:
                outputs[name] = r if isinstance(r, str) else r.content

    # Persist to state
    for key in ("challenger", "analyst", "reviewer"):
        if key in outputs and outputs[key]:
            state.set_output(state.current_round, "B", key, outputs[key])
            state.append_discussion(state.current_round, f"B_{key}", key, outputs[key])
            state.kb_store(state.current_round, key, outputs[key])

    for key in ("contrarian", "gap_finder"):
        if outputs.get(key):
            state.set_output(state.current_round, "B", key, outputs[key])
            label = {"contrarian": "🟣 Contrarian Alternatives", "gap_finder": "🔵 Gap Finder Blind Spots"}[key]
            state.append_discussion(state.current_round, f"B_{key}", key, f"### {label}\n\n{outputs[key]}")

    return outputs


# ============================================================
# Phase C — Defender (+ Evidence Hunter)
# ============================================================

async def run_phase_c(state: DebateState, providers: Providers, challenges: dict) -> str:
    """Phase C: Defender 2 gated steps + Evidence Hunter sub-agent."""
    state.current_phase = "C"
    idea = state.idea

    proposer_output = state.get_output(state.current_round, "A", "proposer") or ""
    challenger_output = state.get_output(state.current_round, "B", "challenger") or ""
    analyst_output = state.get_output(state.current_round, "B", "analyst") or ""
    reviewer_attack = state.get_output(state.current_round, "B", "reviewer") or ""
    gap_finder_output = state.get_output(state.current_round, "B", "gap_finder") or ""

    all_challenges = f"Challenger:\n{challenger_output}\n\nAnalyst:\n{analyst_output}"
    if reviewer_attack:
        all_challenges += f"\n\nReviewer:\n{reviewer_attack}"

    # Evidence Hunter in parallel
    evidence_task = None
    if gap_finder_output:
        evidence_task = helpers.call_sub_agent(
            providers,
            ctx.build_evidence_hunter_prompt(idea, gap_finder_output),
            system_prompt=personas.EVIDENCE_HUNTER_SYSTEM,
            max_tokens=2048,
            validator=V.validate_evidence_hunter,
        )

    # Step 1: Evidence search
    step1_prompt = f"""Round {state.current_round} / Phase C / Step 1: Evidence Search

Search for evidence to respond to each challenge.

--- ALL CHALLENGES ---
{all_challenges[:4000]}
--- END ---

For each ❌ critical and ⚠️ medium challenge:
- "competitor already exists" → search "[competitor] complaints / missing features / limitations"
- "market too small" → search "[niche market] growth / expanding"
- "tech not mature" → search "[technology] production ready / case study / used by"
- "hard to acquire users" → search "[analog co] first 100 users / growth hack"
- "not financially viable" → search "[analog co] revenue / bootstrapped success"

Each search: what was found + URL.
If no evidence found: mark `[unverified]`. Do not fabricate.
Return as markdown."""
    step1 = await helpers.call_with_gate(
        providers, step1_prompt,
        V.validate_evidence,
        system_prompt=personas.DEFENDER_SYSTEM,
        max_tokens=3072,
    )

    # Await Evidence Hunter
    evidence_data = ""
    if evidence_task:
        try:
            eh_resp = await evidence_task
            evidence_data = eh_resp.content
            state.set_sub_agent(state.current_round, "evidence_hunter", evidence_data)
            state.append_discussion(state.current_round, "C_evidence", "evidence_hunter",
                                    f"### 🔍 Evidence Hunter Report\n\n{evidence_data}")
        except Exception as e:
            print(f"[PROVE] Evidence Hunter failed: {e}", flush=True)

    # Step 2: Unified response
    evidence_section = f"\n\n🔍 Evidence Hunter Report:\n{evidence_data[:3000]}" if evidence_data else ""

    step2_prompt = f"""Round {state.current_round} / Phase C / Step 2: Unified Defense

Based on your evidence search, respond formally to all challenges.

Evidence search results:
{step1.content[:3000]}{evidence_section}

All challenges:
{all_challenges[:4000]}

Proposer original plan:
{proposer_output[:2000]}

Requirements:
- Respond to every ❌ critical and ⚠️ medium challenge
- Pay special attention to Challenger's Must-Answer Checklist
- Response type: ✅ AGREE / ❌ REFUTE / 🔄 EXTEND / ⚠️ PARTIAL
- AGREE → adjustment. REFUTE → cite search evidence. No evidence → mark `[unverified]`.
- If major adjustment, provide the updated idea version.
- Final: Verdict strengthened / adjusted / vulnerable + stats

⚠️ If you believe challenges cannot be answered and the original direction is untenable:
🔴 PIVOT_OUT: [brief reason + suggested new direction]

Declaring PIVOT_OUT ends the debate. Only declare if truly unsalvageable.

**Critical**: Every REFUTE response MUST cite inline search evidence (`[REF: SEARCH] URL`
from your Step 1 evidence search or the Evidence Hunter report above). Unverified claims
must be labeled `[unverified]`. Dropping citations is not acceptable.

Return as markdown."""
    step2 = await helpers.call_with_gate(
        providers, step2_prompt, V.validate_defender_final,
        system_prompt=personas.DEFENDER_SYSTEM,
        max_tokens=4096,
        use_search=False,  # Defender already has evidence from step 1 + Evidence Hunter
    )

    output = step2.content
    state.set_output(state.current_round, "C", "defender", output)
    state.append_discussion(state.current_round, "C", "defender", output)
    state.kb_store(state.current_round, "defender", output)

    state.defender_pivoted = cons.detect_defender_pivot(output)

    return output


# ============================================================
# Phase D — Voting (2+1 with hidden veto)
# ============================================================

async def run_phase_d(state: DebateState, providers: Providers, config: dict | None = None) -> tuple[dict, str]:
    """Phase D: Challenger score + Analyst/Reviewer binary votes in parallel. Strategist arbitrates on DEADLOCK."""
    state.current_phase = "D"
    round_num = state.current_round

    challenger_score_task = providers.llm.call(
        prompt=ctx.build_challenger_score_prompt(state), model=providers.model,
        system_prompt=personas.CHALLENGER_SYSTEM, max_tokens=1024,
    )
    analyst_vote_task = helpers.collect_vote(
        providers, ctx.build_binary_vote_prompt(state, "analyst"),
        system_prompt=personas.ANALYST_SYSTEM,
    )
    reviewer_vote_task = helpers.collect_vote(
        providers, ctx.build_binary_vote_prompt(state, "reviewer"),
        system_prompt=personas.REVIEWER_SYSTEM,
    )

    results = await asyncio.gather(
        challenger_score_task, analyst_vote_task, reviewer_vote_task,
        return_exceptions=True,
    )

    # Challenger score
    challenger_score = 5
    challenger_reason = ""
    challenger_unresolved = []
    if isinstance(results[0], Exception):
        print(f"[PROVE] Challenger score call failed: {results[0]}", flush=True)
    else:
        raw = results[0].content
        challenger_score = cons.parse_challenger_score(raw)
        try:
            m = re.search(r"\{.*?\}", raw, re.DOTALL)
            if m:
                parsed = json.loads(m.group(0))
                if isinstance(parsed, dict):
                    challenger_score = max(1, min(10, int(parsed.get("score", challenger_score))))
                    challenger_reason = parsed.get("reason", "")
                    challenger_unresolved = parsed.get("unresolved", []) or []
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

    # Analyst + Reviewer
    analyst_vote = results[1][0] if not isinstance(results[1], Exception) else {
        "vote": "CONDITIONAL", "reason": "[AUTO] analyst call failed", "conditions": []
    }
    reviewer_vote = results[2][0] if not isinstance(results[2], Exception) else {
        "vote": "CONDITIONAL", "reason": "[AUTO] reviewer call failed", "conditions": []
    }

    # Map CONDITIONAL → PROCEED with conditions (webapp binary semantics)
    def _binary(vote_dict):
        v = vote_dict.get("vote", "CONDITIONAL").upper()
        if v == "CONDITIONAL":
            return "PROCEED"
        return v if v in ("PROCEED", "REJECT") else "REJECT"

    analyst_binary = _binary(analyst_vote)
    reviewer_binary = _binary(reviewer_vote)

    # Evaluate consensus
    consensus = cons.evaluate_consensus(
        round_num=round_num,
        challenger_score=challenger_score,
        analyst_vote=analyst_binary,
        reviewer_vote=reviewer_binary,
        config=config,
    )

    # Strategist arbitration on DEADLOCK
    strategist_vote = None
    if consensus == "DEADLOCK":
        strat_prompt = ctx.build_strategist_arbitration_prompt(state, analyst_vote, reviewer_vote)
        strat_vote_tuple = await helpers.collect_vote(
            providers, strat_prompt, system_prompt=personas.STRATEGIST_SYSTEM,
        )
        strategist_vote = strat_vote_tuple[0]
        consensus = cons.evaluate_consensus(
            round_num=round_num,
            challenger_score=challenger_score,
            analyst_vote=analyst_binary,
            reviewer_vote=reviewer_binary,
            strategist_vote=_binary(strategist_vote),
            config=config,
        )

    votes = {
        "challenger": {"score": challenger_score, "reason": challenger_reason[:300], "unresolved": challenger_unresolved},
        "analyst": analyst_vote,
        "reviewer": reviewer_vote,
    }
    if strategist_vote:
        votes["strategist"] = strategist_vote

    return votes, consensus


# ============================================================
# Strategist (2-phase) + LOGIC_BLOCKED recovery via mini-round
# ============================================================

async def run_strategist(state: DebateState, providers: Providers) -> dict:
    """2-phase Strategist: Phase 1 analysis (may detect LOGIC_BLOCKED) → Phase 2 plan."""
    state.current_phase = "STRATEGIST"

    # Phase 1: Analysis
    p1_prompt = ctx.build_strategist_phase1_prompt(state, None)
    p1_resp = await providers.llm.call(
        prompt=p1_prompt, model=providers.model,
        system_prompt=personas.STRATEGIST_SYSTEM, max_tokens=6144,
    )
    analysis = p1_resp.content

    # Check LOGIC_BLOCKED
    is_blocked, issues = cons.detect_logic_blocked(analysis)
    logic_blocked_payload = None
    if is_blocked:
        state.logic_blocked_count += 1
        if state.logic_blocked_count >= 2:
            logic_blocked_payload = {"count": state.logic_blocked_count, "issues": issues}
            analysis = f"[LOGIC_BLOCKED WARNING: unresolved logic issues]\n{issues}\n\n---\n\n{analysis}"
        else:
            await run_mini_round(state, providers, issues)
            if state.consensus == "REJECTED":
                return {"analysis": analysis, "logic_blocked": {"count": state.logic_blocked_count, "issues": issues}}
            # Recursive retry — preserve logic_blocked signal so the frontend surfaces that
            # a recovery round ran (and this session should not be treated as clean APPROVED).
            recovered = await run_strategist(state, providers)
            if isinstance(recovered, dict):
                recovered["logic_blocked"] = recovered.get("logic_blocked") or {
                    "count": state.logic_blocked_count,
                    "issues": issues,
                    "recovered": True,
                }
            return recovered

    # Phase 2: Execution plan
    p2_prompt = ctx.build_strategist_phase2_prompt(state, None, analysis)
    p2_resp = await providers.llm.call(
        prompt=p2_prompt, model=providers.model,
        system_prompt=personas.STRATEGIST_SYSTEM, max_tokens=8192,
    )
    plan_output = p2_resp.content

    # Split OUTPUT / SUMMARY
    output_md = plan_output
    summary_md = ""
    if "---SUMMARY---" in plan_output:
        idx = plan_output.find("---SUMMARY---")
        output_md = plan_output[:idx].strip()
        summary_md = plan_output[idx + len("---SUMMARY---"):].strip()

    return {
        "analysis": analysis,
        "output": output_md,
        "summary": summary_md,
        "model": p2_resp.model,
        "logic_blocked": logic_blocked_payload,
    }


async def run_mini_round(state: DebateState, providers: Providers, logic_issues: str) -> None:
    """LOGIC_BLOCKED mini-round: Proposer fix → C/A quick eval → Defender → simplified vote."""
    state.current_phase = "MINI_ROUND"

    # 1. Proposer fix
    fix_resp = await providers.llm.call(
        prompt=ctx.build_mini_round_proposer_prompt(state, logic_issues),
        model=providers.model, system_prompt=personas.PROPOSER_SYSTEM, max_tokens=2048,
    )
    proposer_fix = fix_resp.content

    # 2. Challenger + Analyst quick evaluation (parallel)
    chal_task = providers.llm.call(
        prompt=ctx.build_mini_round_challenge_prompt(state, proposer_fix, logic_issues),
        model=providers.model, system_prompt=personas.CHALLENGER_SYSTEM, max_tokens=1024,
    )
    ana_task = providers.llm.call(
        prompt=ctx.build_mini_round_challenge_prompt(state, proposer_fix, logic_issues),
        model=providers.model, system_prompt=personas.ANALYST_SYSTEM, max_tokens=1024,
    )
    results = await asyncio.gather(chal_task, ana_task, return_exceptions=True)
    challenges = "\n\n".join(r.content for r in results if not isinstance(r, Exception))

    # 3. Defender
    def_resp = await providers.llm.call(
        prompt=ctx.build_mini_round_defender_prompt(state, proposer_fix, challenges),
        model=providers.model, system_prompt=personas.DEFENDER_SYSTEM, max_tokens=2048,
    )

    # 4. Simplified vote
    mini_discussion = (
        f"Logic issues: {logic_issues}\n\n"
        f"Proposer fix: {proposer_fix}\n\n"
        f"Quick evaluation: {challenges}\n\n"
        f"Defender: {def_resp.content}"
    )

    c_score_prompt = f"""LOGIC_BLOCKED Mini-Round — Market Assessment

{mini_discussion}

After the logic fix, has market viability improved? Give 1-10 score + reason.
JSON: {{"score": N, "reason": "..."}}"""
    c_resp = await providers.llm.call(
        prompt=c_score_prompt, model=providers.model,
        system_prompt=personas.CHALLENGER_SYSTEM, max_tokens=512,
    )
    challenger_score = cons.parse_challenger_score(c_resp.content)

    a_vote_tuple = await helpers.collect_vote(
        providers,
        f"LOGIC_BLOCKED Mini-Round — Vote\n\n{mini_discussion}\n\nAfter the logic fix, is this worth pursuing?\nPROCEED or REJECT only.\nJSON: {{\"vote\": \"PROCEED|REJECT\", \"reason\": \"...\"}}",
        system_prompt=personas.ANALYST_SYSTEM,
    )
    r_vote_tuple = await helpers.collect_vote(
        providers,
        f"LOGIC_BLOCKED Mini-Round — Vote\n\n{mini_discussion}\n\nAfter the logic fix, do core assumptions hold?\nPROCEED or REJECT only.\nJSON: {{\"vote\": \"PROCEED|REJECT\", \"reason\": \"...\"}}",
        system_prompt=personas.REVIEWER_SYSTEM,
    )

    def _binary(v):
        x = v.get("vote", "CONDITIONAL").upper()
        return "PROCEED" if x == "CONDITIONAL" else (x if x in ("PROCEED", "REJECT") else "REJECT")

    consensus = cons.evaluate_consensus(
        round_num=2,  # Mini-round uses R2+ threshold
        challenger_score=challenger_score,
        analyst_vote=_binary(a_vote_tuple[0]),
        reviewer_vote=_binary(r_vote_tuple[0]),
    )
    # Mini-round is a recovery path — cap at CONDITIONAL_APPROVED.
    # A debate that required logic-recovery should not get a full APPROVED verdict.
    if consensus in ("APPROVED", "DEADLOCK"):
        consensus = "CONDITIONAL_APPROVED"

    state.consensus = consensus


# ============================================================
# Pivot handling
# ============================================================

async def _handle_pivot_out(state: DebateState, providers: Providers, source: str, reason: str) -> str:
    """Generate pivot report and end session as REJECTED."""
    prompt = ctx.build_strategist_pivot_prompt(state, source, reason)
    resp = await providers.llm.call(
        prompt=prompt, model=providers.model,
        system_prompt=personas.STRATEGIST_SYSTEM, max_tokens=4096,
    )
    state.consensus = "REJECTED"
    state.current_phase = "DONE"
    return resp.content


# ============================================================
# Main orchestration
# ============================================================

class _TrackingLLM:
    """Wraps an LLMProvider, auto-accumulating cost/tokens on every call."""
    def __init__(self, inner):
        self._inner = inner
        self.total_cost = 0.0
        self.total_in = 0
        self.total_out = 0

    # Pass-through attributes (e.g., provider, default_model)
    def __getattr__(self, name):
        return getattr(self._inner, name)

    async def call(self, *args, **kwargs):
        resp = await self._inner.call(*args, **kwargs)
        self._accum(resp)
        return resp

    async def call_with_search(self, *args, **kwargs):
        resp = await self._inner.call_with_search(*args, **kwargs)
        self._accum(resp)
        return resp

    def _accum(self, resp):
        if resp is None:
            return
        self.total_cost += getattr(resp, "cost_usd", 0.0) or 0.0
        self.total_in += getattr(resp, "input_tokens", 0) or 0
        self.total_out += getattr(resp, "output_tokens", 0) or 0


def _build_round_entry(state: DebateState, round_num: int, votes: dict | None = None, consensus: str | None = None) -> dict:
    """Assemble a round entry dict for persistence (may be partial if pivoted)."""
    return {
        "round": round_num,
        "proposer": state.get_output(round_num, "A", "proposer") or "",
        "phase_a5_reviewer": state.get_output(round_num, "A5", "reviewer") or "",
        "challenger": state.get_output(round_num, "B", "challenger") or "",
        "challenger_score": (votes or {}).get("challenger", {}).get("score", 0),
        "analyst": state.get_output(round_num, "B", "analyst") or "",
        "defender": state.get_output(round_num, "C", "defender") or "",
        "reviewer": state.get_output(round_num, "B", "reviewer") or "",
        "trend_scout": state.get_sub_agent(round_num, "trend_scout") or "",
        "contrarian": state.get_output(round_num, "B", "contrarian") or "",
        "gap_finder": state.get_output(round_num, "B", "gap_finder") or "",
        "benchmark_hunter": state.get_sub_agent(round_num, "benchmark_hunter") or "",
        "evidence_hunter": state.get_sub_agent(round_num, "evidence_hunter") or "",
        "votes": votes or {},
        "consensus": consensus or "",
        "pivoted": consensus == "PIVOTED",
    }


async def run_debate(
    session_id: str,
    idea: str,
    providers: Providers,
    on_progress=None,
    session_config: str = "",
    tags: list[str] | None = None,
    config: dict | None = None,
) -> dict:
    """
    Run Prove multi-agent debate with full CLI parity.
    Returns dict with rounds, votes, verdict, report, costs, model.
    """
    state = DebateState(
        session_id=session_id,
        idea=idea,
        session_config=session_config,
        tags=tags or [],
    )

    # Wrap llm provider to auto-accumulate cost/tokens
    original_llm = providers.llm
    tracked = _TrackingLLM(original_llm)
    providers.llm = tracked  # type: ignore

    async def progress(msg: str, pct: int | None = None):
        if on_progress:
            await on_progress("debate", msg, pct)

    rounds_data: list[dict] = []
    pivot_report: str | None = None
    strategist_result: dict | None = None

    try:
        await providers.storage.update_status("prove_sessions", session_id, "running")
        await progress("Starting multi-agent debate...", 3)

        for round_num in range(1, MAX_ROUNDS + 1):
            state.current_round = round_num

            # Phase progress percentage mapping
            r_base = {1: 5, 2: 35, 3: 60}[round_num]

            # Phase A
            await progress(f"Round {round_num}: Proposer presenting...", r_base + 2)
            proposer_output = await run_phase_a(state, providers)

            # Pivot check after A (R2+ only)
            if round_num > 1:
                is_pivot, pivot_reason = cons.detect_pivot_out(proposer_output, "proposer")
                if is_pivot:
                    await progress("PIVOT_OUT detected by Proposer — generating pivot report...", 85)
                    pivot_report = await _handle_pivot_out(state, providers, "proposer", pivot_reason)
                    # Persist partial round data (Phase A only)
                    partial = _build_round_entry(state, round_num, consensus="PIVOTED")
                    rounds_data.append(partial)
                    try:
                        await providers.storage.append_round(session_id, partial)
                    except Exception:
                        pass
                    break

            # Phase A.5
            await progress(f"Round {round_num}: Reviewer fact-checking...", r_base + 5)
            await run_phase_a5(state, providers, proposer_output)

            # Phase B
            await progress(f"Round {round_num}: Challenger + Analyst + sub-agents...", r_base + 12)
            challenges = await run_phase_b(state, providers, config)

            # Pivot check after B (R2+ only)
            if round_num > 1:
                challenger_out = state.get_output(round_num, "B", "challenger") or ""
                is_pivot, pivot_reason = cons.detect_pivot_out(challenger_out, "challenger")
                if is_pivot:
                    await progress("DIRECTION_CHANGE detected by Challenger — generating pivot report...", 85)
                    pivot_report = await _handle_pivot_out(state, providers, "challenger", pivot_reason)
                    partial = _build_round_entry(state, round_num, consensus="PIVOTED")
                    rounds_data.append(partial)
                    try:
                        await providers.storage.append_round(session_id, partial)
                    except Exception:
                        pass
                    break

            # Phase C
            await progress(f"Round {round_num}: Defender responding...", r_base + 20)
            defender_output = await run_phase_c(state, providers, challenges)

            # Pivot check after C
            is_pivot, pivot_reason = cons.detect_pivot_out(defender_output, "defender")
            if is_pivot:
                await progress("PIVOT_OUT detected by Defender — generating pivot report...", 85)
                pivot_report = await _handle_pivot_out(state, providers, "defender", pivot_reason)
                partial = _build_round_entry(state, round_num, consensus="PIVOTED")
                rounds_data.append(partial)
                try:
                    await providers.storage.append_round(session_id, partial)
                except Exception:
                    pass
                break

            # Phase D: vote
            await progress(f"Round {round_num}: Voting...", r_base + 25)
            votes, consensus = await run_phase_d(state, providers, config)
            state.consensus = consensus
            state.add_votes(round_num, votes)

            # Assemble round data for DB
            round_entry = _build_round_entry(state, round_num, votes=votes, consensus=consensus)
            rounds_data.append(round_entry)

            # Save progress
            try:
                await providers.storage.append_round(session_id, round_entry)
            except Exception as e:
                print(f"[PROVE] append_round failed: {e}", flush=True)

            # Early exit on clear decision
            if consensus == "APPROVED":
                await progress(f"Round {round_num}: APPROVED — Strategist synthesizing report...", 85)
                strategist_result = await run_strategist(state, providers)
                break
            elif consensus == "CONDITIONAL_APPROVED":
                await progress(f"Round {round_num}: CONDITIONAL — Strategist synthesizing report...", 85)
                strategist_result = await run_strategist(state, providers)
                break
            elif consensus == "REJECTED":
                break
            # CONTINUE → next round
        else:
            # Ran out of rounds without decision
            if state.consensus == "CONTINUE" or state.consensus == "PENDING":
                state.consensus = "CONDITIONAL_APPROVED"
                await progress("Max rounds reached — Strategist finalizing as CONDITIONAL...", 85)
                strategist_result = await run_strategist(state, providers)

        # Build vote summary
        vote_counts = {"PROCEED": 0, "CONDITIONAL": 0, "REJECT": 0}
        all_conditions: list[str] = []
        if state.votes_history:
            last = state.votes_history[-1]
            for key in ("analyst", "reviewer", "strategist"):
                if key in last:
                    vote_raw = last[key].get("vote", "")
                    vote = vote_raw.upper() if isinstance(vote_raw, str) else ""
                    if vote in vote_counts:
                        vote_counts[vote] += 1
                    all_conditions.extend(last[key].get("conditions", []) or [])

        # Map internal consensus to external verdict
        verdict_map = {
            "APPROVED": "APPROVED",
            "CONDITIONAL_APPROVED": "CONDITIONAL_APPROVED",
            "REJECTED": "REJECTED",
            "CONTINUE": "CONDITIONAL_APPROVED",
            "DEADLOCK": "CONDITIONAL_APPROVED",
            "PENDING": "CONDITIONAL_APPROVED",
        }
        verdict = verdict_map.get(state.consensus, "CONDITIONAL_APPROVED")

        # Build report payload
        report = {
            "output": strategist_result["output"] if strategist_result else "",
            "summary": strategist_result.get("summary", "") if strategist_result else "",
            "analysis": strategist_result.get("analysis", "") if strategist_result else "",
            "verdict": verdict,
            "vote_summary": {
                "vote_counts": vote_counts,
                "conditions": list(dict.fromkeys(all_conditions))[:10],
                "total_voters": sum(vote_counts.values()),
            },
            "model": providers.model,
            "logic_blocked": strategist_result.get("logic_blocked") if strategist_result else None,
            "pivot_report": pivot_report,
        }

        # Persist
        await providers.storage.save_prove_results(
            session_id=session_id,
            rounds=rounds_data,
            votes=report["vote_summary"],
            verdict=verdict,
            report=report,
            total_cost_usd=tracked.total_cost,
            total_input_tokens=tracked.total_in,
            total_output_tokens=tracked.total_out,
            model=original_llm.default_model if hasattr(original_llm, "default_model") else providers.model,
        )

        await progress(f"Verification complete! Verdict: {verdict}. Cost: ${tracked.total_cost:.2f}", 100)

        return {
            "session_id": session_id,
            "rounds": rounds_data,
            "votes": report["vote_summary"],
            "verdict": verdict,
            "report": report,
            "costs": {"total_usd": round(tracked.total_cost, 4)},
        }

    except Exception:
        traceback.print_exc()
        try:
            await providers.storage.update_status("prove_sessions", session_id, "error")
        except Exception:
            pass
        raise
    finally:
        # Restore original LLM provider reference
        providers.llm = original_llm  # type: ignore
