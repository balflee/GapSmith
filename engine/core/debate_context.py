"""
Prompt builders for Prove multi-agent debate.

Ported from pipeline/debate_context.py, adapted for:
- In-memory DebateState (no file reads)
- English output (webapp default)
- System-prompt-aware LLM calls (personas live in debate_personas)

Each builder returns a str prompt ready to pass to providers.llm.call().
"""

from __future__ import annotations

from engine.core.debate_state import DebateState


# ============================================================
# Phase A — Proposer
# ============================================================

def build_phase_a_prompt(state: DebateState, config: dict | None = None) -> str:
    round_num = state.current_round

    if round_num == 1:
        prompt = f"""Round {round_num} / Phase A: Proposal

You are in debate mode. Present your startup idea analysis for this topic.

--- IDEA / INPUT ---
{state.idea}
--- END INPUT ---
"""
        if state.session_config:
            prompt += f"""
--- SESSION CONFIG (product modes / profile) ---
{state.session_config}
--- END SESSION CONFIG ---
"""
        prompt += """
Your proposal must cover:
1. **Problem**: Specific pain point. Who has it. Evidence from the web (search Reddit, HN, GitHub Issues, Twitter for real complaints — cite URLs with [REF: SEARCH]).
2. **Solution**: How does it solve the pain. Core product.
3. **Target Market**: First 100 customers. TAM/SAM/SOM estimates (mark as [assumption] with estimation logic).
4. **Business Model**: Pricing strategy. Benchmark against real competitor prices.
5. **Why Now**: What changed that makes this viable/necessary now.
6. **Competitive Landscape**: Who else is doing this (search Product Hunt / G2 / Capterra). Differentiation.
7. **MVP Scope**: Minimum viable version. Use `SESSION_CONFIG.Budget` and `SESSION_CONFIG.Timeline` when present in the SESSION CONFIG block above; otherwise default to ~$10K budget / 4-8 weeks.

Use specific data and examples. **Cite at least 3 sources inline** using `[REF: SEARCH] URL`
format (the Trend Scout section below will give you real URLs — use them). Unsourced market
claims are not acceptable. Avoid vague claims.
Return your complete proposal as a single markdown response."""
    else:
        prev_full = state.get_previous_round_full()
        unresolved = state.get_unresolved_questions()
        snapshot = state.consensus_snapshot

        prompt = f"""Round {round_num} / Phase A: Round {round_num} Adjustment

Based on feedback from Round {round_num - 1}, adjust your proposal. Focus on:
- Answering Challenger's Must-Answer Checklist items that remain unresolved
- Addressing Analyst's financial concerns with evidence
- Addressing Reviewer's fact-check flags

Do NOT repeat already-resolved points.

--- CURRENT CONSENSUS SNAPSHOT ---
{snapshot or "(none)"}
--- END SNAPSHOT ---

--- UNRESOLVED QUESTIONS ---
{unresolved or "(none)"}
--- END UNRESOLVED ---

--- PREVIOUS ROUND FULL DISCUSSION ---
{prev_full or "(none)"}
--- END PREVIOUS ROUND ---

⚠️ PIVOT DECLARATION (only if truly needed):

If — and ONLY if — the original direction fundamentally can't be salvaged (core value prop must change, business model must change, target market must change, or this is essentially a new idea), declare pivot on the VERY FIRST LINE of your response:

🔴 PIVOT_OUT: [brief reason why original direction is dead + what new direction you suggest]

**Strict rule**: If you are NOT pivoting, do NOT write the token PIVOT_OUT anywhere in your response — not even in phrases like "no PIVOT_OUT needed". Either pivot (first line = the marker) or do not mention it at all.

Small adjustments (pricing, user segment, feature scope) do NOT require PIVOT_OUT — just make the adjustments and continue.

Return your complete adjusted proposal as a single markdown response."""

    return prompt


# ============================================================
# Phase A.5 — Reviewer fact-check
# ============================================================

def build_phase_a5_prompt(state: DebateState, config: dict | None, proposer_output: str) -> str:
    round_num = state.current_round
    mode = "(lightweight flagging mode — no blocking)" if round_num == 1 else "(formal fact-check — hallucinations MUST be corrected)"

    return f"""Round {round_num} / Phase A.5: Fact-Check Review

Task: Review every factual claim in the Proposer's output. {mode}

--- PROPOSER OUTPUT ---
{proposer_output}
--- END PROPOSER OUTPUT ---

Review checklist:
- Company names, pricing, contract statuses — do they have sources? No source → ❌ hallucination risk
- [assumption]-tagged estimates — do they have estimation logic? No logic → ❌ invalid estimate
- Unmarked assumptions presented as facts → mark ⚠️ unverified
- Market data — is there [REF: SEARCH] or [REF: INPUT]?

Output format:

| Claim | Source | Status |
|-------|--------|--------|
| "..." | [REF: ...] or none | ✅ verified / ⚠️ unverified / ❌ hallucination risk |

**Hallucination risk count**: X items need correction

**Critical**: A fact-check without sources is meaningless. For every `✅ verified` claim, include
the source URL that verifies it (`[REF: SEARCH] URL`). Use web search to confirm claims — at
least 2 inline URLs required.

Return the review as markdown."""


def build_hallucination_correction_prompt(state: DebateState, flags: list[str]) -> str:
    flags_text = "\n".join(f"- {f}" for f in flags)
    return f"""Round {state.current_round} / Phase A.5: Fix Hallucination Flags

Reviewer flagged these hallucination risks. Fix each:

{flags_text}

For each flagged item:
- If you have a real source → add `[REF: SEARCH] URL`
- If it's inference → change to `[assumption]` and add estimation logic
- If it's fabricated → delete the claim

Return only the corrected passages (not the full proposal)."""


# ============================================================
# Phase B — Challenger, Analyst, Reviewer
# ============================================================

def build_phase_b_challenger_prompt(state: DebateState, config: dict | None = None) -> str:
    round_num = state.current_round
    proposer_output = state.get_output(round_num, "A", "proposer") or ""
    factcheck = state.get_output(round_num, "A5", "reviewer") or ""
    snapshot = state.consensus_snapshot if round_num > 1 else ""

    prompt = f"""Round {round_num} / Phase B: Market Challenge

Task: Challenge the market viability of this proposal with evidence.

--- PROPOSER OUTPUT ---
{proposer_output}
--- END PROPOSER OUTPUT ---

--- REVIEWER FACT-CHECK ---
{factcheck}
--- END FACT-CHECK ---
"""
    if snapshot:
        prompt += f"""
--- CONSENSUS SNAPSHOT ---
{snapshot}
--- END SNAPSHOT ---
"""
    prompt += """
Requirements:
- Challenges must be specific and verifiable (not "demand seems questionable")
- Evaluate Proposer's own anticipated challenges — are they adequately addressed?
- Give a market viability score 1-10
- 3 deep challenges > 6 shallow ones
- Search for real market data to support challenges (use Product Hunt, G2, Capterra, Reddit)
- Produce a Must-Answer Checklist (3-5 core questions Defender MUST answer)

Round 2+ only: If Proposer fundamentally shifted direction from Round 1, declare `🔴 DIRECTION_CHANGE` with reason.

Output sections:
1. **Challenger Analysis** — market challenges + evidence + URLs
2. **Contrarian Alternatives** — at least 1 completely different direction (not a variant)
3. **Gap Finder Blind Spots** — at least 2 critical issues everyone else missed
4. **Must-Answer Checklist** — 3-5 core questions
5. **Final Summary**: `Challenger Score: X/10` + `Verdict: viable / questionable / dead`

Return as markdown."""
    return prompt


def build_phase_b_analyst_prompt(state: DebateState, config: dict | None = None) -> str:
    round_num = state.current_round
    proposer_output = state.get_output(round_num, "A", "proposer") or ""
    factcheck = state.get_output(round_num, "A5", "reviewer") or ""

    prompt = f"""Round {round_num} / Phase B: Financial Analysis

Task: Evaluate financial viability under the lean startup lens.

--- PROPOSER OUTPUT ---
{proposer_output}
--- END PROPOSER OUTPUT ---

--- REVIEWER FACT-CHECK ---
{factcheck}
--- END FACT-CHECK ---

Constraints (defaults — `SESSION_CONFIG` below overrides any value it specifies):
- MVP budget cap: ~$10K (use `SESSION_CONFIG.Budget` if provided)
- Team: 4-5 people, validation cycle: 4-8 weeks (use `SESSION_CONFIG.Team` / `SESSION_CONFIG.Timeline` if provided)
- All assumptions must have explicit estimation logic (no bare numbers)
- Search for real competitor pricing, industry ARPU, funding rounds — include URLs
- Year-1 revenue threshold: use `SESSION_CONFIG.Revenue_threshold` if provided (e.g. Solo $30K/yr, Founder Couple $50K/yr, Small Team $50-80K/yr); else default $100K/yr. Below threshold = LOW_ROI.

Analysis steps:
1. **Lean Feasibility Check** — score proportionally against the user's stated Budget:
   - 🟢 LEAN_FIT: estimated MVP cost ≤ Budget
   - 🟡 STRETCH: estimated MVP cost ≤ Budget × 2.5
   - 🔴 NOT_LEAN: estimated MVP cost > Budget × 2.5
   If SESSION CONFIG above is empty, default Budget = $10K (so LEAN_FIT ≤ $10K, STRETCH ≤ $25K, NOT_LEAN > $25K).
2. **Cost Structure** — categorized list + 10-15% buffer
3. **Revenue Model** — at least 2 scenarios (pessimistic / base / optimistic) with math
4. **ROI + Break-Even** → 🟢 HIGH_ROI / 🟡 MED_ROI / 🔴 LOW_ROI
5. **Critical Assumptions** — 3-5 "if wrong, conclusion changes" assumptions
6. **Final Verdict**: VIABLE / MARGINAL / NOT_VIABLE
"""
    if state.session_config:
        prompt += f"""
--- SESSION CONFIG ---
{state.session_config}
--- END SESSION CONFIG ---

Evaluate the recommended product form's technical complexity and development cost impact on MVP budget and timeline.
Cost coefficient reference: Web SaaS 1.0x / Mobile 1.5-2.0x / CLI 0.5x / Browser Extension 0.7x / Marketplace 1.3x
"""
    prompt += "\nReturn the complete analysis as markdown."
    return prompt


def build_phase_b_reviewer_prompt(state: DebateState, config: dict | None = None) -> str:
    round_num = state.current_round
    proposer_output = state.get_output(round_num, "A", "proposer") or ""
    factcheck = state.get_output(round_num, "A5", "reviewer") or ""
    analyst_output = state.get_output(round_num, "B", "analyst") or ""

    return f"""Round {round_num} / Phase B: Assumption Attack

Task: Deep stress-test of core assumptions via reverse-evidence search.

--- PROPOSER OUTPUT ---
{proposer_output}
--- END ---

--- FACT-CHECK ---
{factcheck}
--- END ---

--- ANALYST ANALYSIS (reference low-confidence assumptions) ---
{analyst_output}
--- END ---

Requirements:
- At least 3 assumption attacks (detailed)
- At least 2 edge cases (extreme scenarios: "what if a big co enters?", "regulation changes?")
- Prioritize Analyst's low-confidence assumptions
- Industry-specific risks MUST be checked
- Each attack must include web-search evidence (URLs)

Assumption Attack format:
**🔴 Assumption Attack #N**
- **Assumption**: "[the assumption being attacked]"
- **Attack**: "If it doesn't hold, then..."
- **Verification Method**: how to test
- **Cost/Time**: X days/weeks
- **Severity**: 🔴 fatal / 🟡 important / 🟢 minor

Edge Case format:
**🟡 Edge Case #N**
- **Scenario**: "If [extreme condition]..."
- **Probability**: low/medium/high
- **Impact**: on the idea
- **Needs Defender Response**: [specific question]

Final verdict: HOLD / CONDITIONAL / PROCEED
Must-Resolve: X conditions

Return as markdown."""


# ============================================================
# Phase C — Defender
# ============================================================

def build_phase_c_prompt(state: DebateState, config: dict | None = None) -> str:
    round_num = state.current_round
    proposer_output = state.get_output(round_num, "A", "proposer") or ""
    factcheck = state.get_output(round_num, "A5", "reviewer") or ""
    challenger_output = state.get_output(round_num, "B", "challenger") or ""
    analyst_output = state.get_output(round_num, "B", "analyst") or ""
    reviewer_attack = state.get_output(round_num, "B", "reviewer") or ""

    challenges_block = f"""--- CHALLENGER ---
{challenger_output}
--- END CHALLENGER ---

--- ANALYST ---
{analyst_output}
--- END ANALYST ---
"""
    if reviewer_attack:
        challenges_block += f"""
--- REVIEWER ASSUMPTION ATTACK ---
{reviewer_attack}
--- END REVIEWER ---
"""

    return f"""Round {round_num} / Phase C: Unified Defense

Task: Respond to every challenge from Challenger + Analyst + Reviewer with evidence or adjustment.

--- PROPOSER ORIGINAL PROPOSAL ---
{proposer_output}
--- END ---

--- FACT-CHECK ---
{factcheck}
--- END ---

{challenges_block}

Requirements:
- Respond to EVERY ❌ critical and ⚠️ medium challenge
- Pay special attention to Challenger's Must-Answer Checklist — every item must be answered
- For each challenge, choose response type:
  - ✅ AGREE: accept the challenge, propose adjustment
  - ❌ REFUTE: reject with evidence (search for proof)
  - 🔄 EXTEND: partially valid, extend the plan
  - ⚠️ PARTIAL: partially agree
- AGREE must include adjustment. REFUTE must include search evidence (URLs).
- Never fabricate evidence. If you can't find a source, mark `[unverified]`.
- If you accept a major adjustment, provide the updated idea version.

If — and ONLY if — the criticisms show the idea is fundamentally broken AND cannot be salvaged through adjustment, declare pivot at the VERY FIRST LINE of your response:
🔴 PIVOT_OUT: [honest reasoning + what new direction might work]

**Strict rule**: If you are NOT pivoting, do not write the token PIVOT_OUT anywhere in your response — not even in negations like "no pivot needed" or "this is not a PIVOT_OUT case". Either pivot (first line = the marker) or do not mention it at all.

If your response represents a significant direction shift (but NOT a full pivot), mark `🔄 EVOLVE` at the top instead.

Output format:
1. **Response Tracker**:
   | Challenge | Response Type | Core Argument |
   |-----------|---------------|---------------|

2. **Detailed Responses** — one section per ❌/⚠️ challenge

3. **Evidence Search Results** — real URLs supporting responses

4. **Updated Idea Version** — if major adjustment

5. **Final Summary**:
   - **Verdict**: strengthened / adjusted / vulnerable
   - **Response Stats**: X agreed / Y refuted / Z partial

Return as markdown."""


# ============================================================
# Phase D — Voting
# ============================================================

def _build_round_discussion(state: DebateState) -> str:
    """Collect all outputs from current round as discussion context."""
    round_num = state.current_round
    parts = []
    phase_order = [("A", "proposer"), ("A5", "reviewer"), ("B", "challenger"),
                   ("B", "analyst"), ("B", "reviewer"), ("C", "defender")]
    for phase, agent in phase_order:
        content = state.get_output(round_num, phase, agent)
        if content:
            parts.append(f"\n### Phase {phase} — {agent.title()}\n\n{content}")
    return "\n".join(parts)


def build_challenger_score_prompt(state: DebateState) -> str:
    """Challenger scoring (hidden veto). Doesn't know it's a vote."""
    discussion = _build_round_discussion(state)

    return f"""Round {state.current_round} / Phase D: Final Market Viability Assessment

Read the full round discussion and give your final market viability score.

--- ROUND DISCUSSION ---
{discussion}
--- END ---

Assessment dimensions:
- Is the target market real and large enough?
- Competitive landscape — is there differentiation space?
- Is payment willingness validated?
- Did Defender adequately answer your Must-Answer Checklist?
- Were the failure cases / competitor data you found properly addressed?

Give a 1-10 market viability score + reasoning.

Return as JSON only:
```json
{{
  "score": <1-10 integer>,
  "reason": "<3-5 sentences explaining the score>",
  "unresolved": ["<key question 1>", "<key question 2>"]
}}
```"""


def build_binary_vote_prompt(state: DebateState, agent_name: str) -> str:
    discussion = _build_round_discussion(state)
    role_focus = {
        "analyst": "financial viability (lean feasibility, cost, revenue model, ROI)",
        "reviewer": "factual accuracy and core assumption strength",
    }
    focus = role_focus.get(agent_name, "overall viability")

    return f"""Round {state.current_round} / Phase D: Vote

Read the full round discussion and give your final judgment.

--- ROUND DISCUSSION ---
{discussion}
--- END ---

Your assessment focus: {focus}

Before voting, consider:
- Which critical questions were resolved this round?
- Which important questions remain unresolved?
- Is the Defender's response adequately evidence-backed?
- Based on your analysis, is this idea worth pursuing?

⚠️ Only two options — binary choice:
- PROCEED: worth pursuing based on current evidence
- REJECT: fundamental problems — not worth pursuing

Return as JSON only:
```json
{{
  "vote": "PROCEED" | "REJECT",
  "reason": "<2-3 sentences>",
  "conditions": ["<condition 1>", "<condition 2>"]
}}
```"""


def build_strategist_arbitration_prompt(state: DebateState, analyst_vote: dict, reviewer_vote: dict) -> str:
    discussion = _build_round_discussion(state)

    return f"""Round {state.current_round} / Arbitration Vote

Analyst and Reviewer votes are deadlocked 1:1. You must arbitrate.

--- ROUND DISCUSSION ---
{discussion}
--- END ---

--- ANALYST VOTE ---
Vote: {analyst_vote.get('vote')}
Reason: {analyst_vote.get('reason')}
--- END ---

--- REVIEWER VOTE ---
Vote: {reviewer_vote.get('vote')}
Reason: {reviewer_vote.get('reason')}
--- END ---

Independent judgment: based on the discussion and both sides' reasoning, should this idea proceed?

⚠️ Only two options:
- PROCEED: worth pursuing (may include conditions)
- REJECT: not worth pursuing

Return as JSON only:
```json
{{
  "vote": "PROCEED" | "REJECT",
  "reason": "<2-3 sentences>",
  "conditions": ["<condition 1>", "<condition 2>"]
}}
```"""


# ============================================================
# Strategist — 2-phase + Pivot
# ============================================================

def build_strategist_phase1_prompt(state: DebateState, config: dict | None = None) -> str:
    """Phase 1: consensus integration + logic check (may detect LOGIC_BLOCKED)."""
    sc_block = ""
    if state.session_config:
        sc_block = f"""

--- SESSION CONFIG (user's actual constraints — overrides defaults) ---
{state.session_config}
--- END SESSION CONFIG ---
"""
    return f"""Strategist Phase 1/2 — Consensus Integration + Logic Check

Session: {state.session_id}
Status: {state.consensus}
LOGIC_BLOCKED attempts: {state.logic_blocked_count} (2nd attempt = last chance)

Task: Analyze the full debate. Focus on understanding and finding problems. No planning yet.{sc_block}

--- FULL DISCUSSION ---
{state.discussion}
--- END DISCUSSION ---

--- CONSENSUS SNAPSHOT ---
{state.consensus_snapshot or "(none)"}
--- END SNAPSHOT ---

--- VOTE HISTORY ---
{state.votes_history}
--- END VOTES ---

Output:

## 1. Consensus Integration

### Core Positioning
- **Product**: [final positioning]
- **Target User**: [final user]
- **Value Proposition**: [final prop]

### Key Decisions
| # | Decision Point | Conclusion | Round Confirmed |
|---|----------------|------------|-----------------|

### Conditions (if CONDITIONAL_APPROVED)
- Condition 1: ...
- Condition 2: ...

## 2. Logic Check

### Preconditions
- [ ] Condition 1: [idea's founding premise]
- [ ] Condition 2: ...

### Causal Chain
A (start) → B (key step) → C (outcome)
If B doesn't hold? → Plan B: ...

### Missing Links
- ⚠️ [gap that needs addressing]

### Logic Gaps
- 🔴 [critical issue, if any]

## 3. Unresolved Risks
| Risk | Source | Severity | Mitigation |
|------|--------|----------|------------|

## 4. Verdict
- Is the logic coherent?
- Any fatal contradictions?
- Ready for Phase 2 (execution plan)?

If you find FATAL logic problems (self-contradicting core assumptions, broken causal chain),
start your reply with "LOGIC_BLOCKED" + specific problem description.
Only return LOGIC_BLOCKED if the issue is truly unresolvable. Mark smaller issues [TBD] and continue.

Return as markdown."""


def build_strategist_phase2_prompt(state: DebateState, config: dict | None, analysis: str) -> str:
    sc_block = ""
    if state.session_config:
        sc_block = f"""

--- SESSION CONFIG (user's actual constraints — overrides defaults) ---
{state.session_config}
--- END SESSION CONFIG ---
"""
    return f"""Strategist Phase 2/2 — Execution Roadmap + Summary

Session: {state.session_id}
Status: {state.consensus}

Task: Based on Phase 1 analysis, design the execution plan.{sc_block}

--- PHASE 1 ANALYSIS ---
{analysis}
--- END ANALYSIS ---

Generate TWO parts, separated by `---SUMMARY---`.

## Part 1: OUTPUT (Full Execution Plan)

### Execution Roadmap
- Phase 0 Validation (Week 1-X): goals, task table, milestones, Kill Switch
- Phase 1 MVP (Week X-Y): goals, tasks, milestones
- Phase 2 Growth (Week Y-Z): goals, tasks

Each Phase format:
| Week | Task | Output | Metric | Kill Switch |
|------|------|--------|--------|-------------|

End-of-Phase Decision:
- ✅ Continue if: [condition]
- ❌ Stop if: [condition]

### Resource Plan
- **Team**: | Role | Responsibility | % Time | When |
- **Budget**: | Phase | Budget | Main Costs | (total ≤ `SESSION_CONFIG.Budget` if provided, else ≤ $10K default)
- **External Dependencies**: | Dependency | Criticality | Backup |

### Risk Matrix
| Risk | Probability | Impact | Priority | Prevention | Contingency |
|------|-------------|--------|----------|------------|-------------|

### Success Metrics
- **North Star**: [metric] → Target: [number] → Deadline: [time]
- **Per-Phase Metrics**: | Phase | Metric | Target | Floor |
- **Kill Switches**: | Condition | Check Time | Action |

---SUMMARY---

## Part 2: SUMMARY (1-Page Lean Canvas + 7-Day Sprint)

### 🎯 Lean Canvas

| Element | Content |
|---------|---------|
| **Target User** | [specific description] |
| **Pain** | [one sentence] |
| **Value Prop** | [one sentence] |
| **Alternatives** | [how users cope now] |
| **Distribution Channel** | [1 main channel] |
| **Core Action** | [activation event] |
| **Monetization** | [model + pricing] |
| **7-Day Goal** | [specific metric] |

### ⚡ 7-Day MVP Sprint Card

| Day | Task | Deliverable |
|-----|------|-------------|
| 1-2 | [build core] | [runnable skeleton] |
| 3-4 | [core feature] | [user can activate] |
| 5-6 | [launch to channel] | [live in main channel] |
| 7 | [measure] | [3 key numbers] |

**Day 7 Decision**:
- 🟢 Continue: repeatable acquisition / revenue / improving retention → Phase 2
- 🟡 Retry: signals but unstable → 1 more sprint
- 🔴 Kill: no signals / only paid ads work / pain is weak → archive

Return as markdown."""


def build_strategist_pivot_prompt(state: DebateState, pivot_source: str, pivot_reason: str) -> str:
    return f"""Strategist — Pivot Report

Session: {state.session_id}
Status: PIVOT_OUT
Triggered by: {pivot_source}
Reason: {pivot_reason}

This debate ended due to a fundamental direction conflict. Generate a Pivot Report.

--- ORIGINAL INPUT ---
{state.idea}
--- END INPUT ---

--- FULL DISCUSSION ---
{state.discussion}
--- END DISCUSSION ---

Output:

## Pivot Report

### 1. Original Direction Summary
- What was the original idea?
- What stage did the discussion reach?

### 2. Why the Original Direction Was Abandoned
- Who triggered the pivot? ({pivot_source})
- Specific reasons (cite challenges and evidence from the discussion)
- Which core assumptions were invalidated?

### 3. New Direction Suggestion
- What new direction emerged from the discussion?
- What are its core assumptions?
- Is it worth starting a new debate session on the new direction?

### 4. Suggested INPUT for New Session
If worth pursuing, the following can be used directly as INPUT for a new debate:
```
[draft INPUT content for the new session]
```

### 5. Lessons
- What was learned from this discussion?
- What to watch out for next time in similar directions?

Return as markdown."""


# ============================================================
# Mini-Round (LOGIC_BLOCKED recovery)
# ============================================================

def build_mini_round_proposer_prompt(state: DebateState, logic_issues: str) -> str:
    return f"""LOGIC_BLOCKED Focused Recovery — Proposer

Strategist identified these FATAL logic problems. Propose a concrete fix:

--- LOGIC ISSUES ---
{logic_issues}
--- END ---

Provide specific solutions or adjustments that resolve each logic issue.
Return as markdown."""


def build_mini_round_challenge_prompt(state: DebateState, proposer_fix: str, logic_issues: str) -> str:
    return f"""LOGIC_BLOCKED Focused Recovery — Quick Evaluation

Original logic issues:
{logic_issues}

Proposer's fix:
{proposer_fix}

Quickly evaluate: does this fix resolve the core logic issues? Return a short verdict as markdown."""


def build_mini_round_defender_prompt(state: DebateState, proposer_fix: str, challenges: str) -> str:
    return f"""LOGIC_BLOCKED Focused Recovery — Defender Response

Proposer's fix:
{proposer_fix}

Challenger/Analyst evaluation:
{challenges}

Respond to the evaluation. Strengthen or adjust the fix. Return as markdown."""


# ============================================================
# Sub-agent prompts
# ============================================================

def build_trend_scout_prompt(idea: str, proposer_summary: str = "", tags: str = "") -> str:
    return f"""Trend Scout — search competitive landscape + market signals

Idea: {idea}
Tags: {tags or "(none)"}

Proposer summary:
{(proposer_summary or idea)[:2000]}

Search priority (run 5-8 web searches):

1. **Competitor features & pricing**:
   - "[competitor] pricing 2025 2026", "[competitor] plans features"
   - "[competitor A] vs [competitor B] comparison"
   - "[competitor] changelog 2025" — what they added recently

2. **Funding activity**:
   - "[space/keyword] funding 2025 2026", "[space] Series A B"
   - "[competitor] funding round", "[competitor] investors"

3. **User signals**:
   - "site:reddit.com [space/pain keyword]"
   - "site:news.ycombinator.com [keyword]"
   - "[space] user complaints", "[competitor] review"

4. **Industry news**: "[space] news 2025 2026", "[space] trends"

Output:

### Competitor Snapshot
For each competitor:
#### [Name]
- **One-liner**: ...
- **Pricing**: [Free / $X/mo / usage-based]
- **Core features**: [3-5 bullets]
- **Complaints/reviews**: ...
- **Source**: [REF: SEARCH] URL

### Funding Activity
| Company | Round | Amount | Date | Investors | Source |
|---------|-------|--------|------|-----------|--------|

### User Signals
| Platform | Volume | Core pain | Link |
|----------|--------|-----------|------|

### Market Trend Summary
1-2 paragraphs synthesizing the above, all evidence-based.

Rules:
- You MUST NOT evaluate whether the idea is good. No scoring, no challenges.
- You MUST NOT generate alternatives. That's the Proposer's job.
- Every data point needs a URL. Don't invent numbers.
"""


def build_contrarian_prompt(idea: str, proposer_summary: str = "") -> str:
    return f"""Contrarian — propose RADICAL alternatives (not variants)

Idea: {idea}

Proposer summary:
{(proposer_summary or idea)[:2000]}

Rules:
- You MUST NOT evaluate whether the idea is good. No scoring.
- Your job: answer "what if we did something fundamentally different instead?"
- Propose at least 1 (max 3) radical alternatives. Each must be GENUINELY different — not a tweak.
- Search for real examples/cases to support each alternative.

Alternative generation prompts:
- Same pain, completely different solution form? (e.g., not SaaS — marketplace / plugin / open-source community / consulting)
- Different target user? (e.g., sell to CFO / investors / compliance teams instead of developers)
- Different business model? (e.g., not subscription — data reports / benchmarks / certification)
- Parasitic strategy? (e.g., not an independent product — a plugin/extension for an existing platform)
- Reverse thinking? (e.g., not "save users money" — "help them prove spend was justified")

Output for each alternative:

### Alternative N: [Name]

**One-liner**: ...
**Fundamental difference from original**: original does X, this does Y
**Why it might be better**: 1-2 reasons
**Real case / evidence**: search result supporting this direction
**Risk**: biggest risk
**Within SESSION_CONFIG.Budget and SESSION_CONFIG.Timeline** (default $10K and 4 weeks): minimum validation approach
"""


def build_gap_finder_prompt(idea: str, proposer_summary: str = "") -> str:
    return f"""Gap Finder — find blind spots everyone missed

Idea: {idea}

Proposer summary:
{(proposer_summary or idea)[:2000]}

Rules:
- You MUST NOT repeat risks the Proposer mentioned or challenges the Challenger might raise (competitors).
- Your job: find OVERLOOKED, non-obvious problems.
- At least 2 (max 5) missed issues. Search for real cases.

Blind spot checklist:

**User-side**:
- What's the target user's actual daily routine? Do they really have time/willingness?
- Retention: will they still use this after a week?
- Hidden alternatives (Excel, internal tools, manual workflows the user has already adapted to)?

**Technical-side**:
- Hidden technical difficulties (accuracy, real-time, security)?
- Third-party API dependency risk (LLM provider changes pricing / API shape)?
- Open-source fork risk?

**Commercial-side**:
- Pricing psychology: does the target user's price expectation match?
- Sales cycle: B2B decision chain length?
- Legal/compliance: data privacy, financial regulation?

**Ecosystem-side**:
- If this succeeds, how does the ecosystem react? (e.g., LLM provider builds this natively)
- Platform risk (framework changes, dependency deprecation)

**"Failure mode" blind spots**:
- Most likely death scenario (not competitor-killed — natural death)
- "Slow boil" risk (market never grows enough)

Output for each:

### Blind Spot N: [Title]

**Severity**: ❌ critical / ⚠️ medium / 💡 worth noting
**Why it's overlooked**: [reason people usually miss it]
**Specific risk**: [what happens if ignored]
**Real case**: [search result of similar situation]
**Recommendation**: [how to handle or validate]
"""


def build_benchmark_hunter_prompt(idea: str, proposer_summary: str = "") -> str:
    return f"""Benchmark Hunter — search REAL pricing / revenue / funding benchmarks

Idea: {idea}

Proposer summary:
{(proposer_summary or idea)[:2000]}

Rules:
- You MUST NOT make financial judgments or ROI evaluations. That's the Analyst's job.
- You MUST NOT invent company data, pricing, or revenue numbers. If you can't find it, say so.
- Run 5-8 web searches minimum. Every data point needs a URL.

Search priority:

1. **Competitor pricing**: "[competitor] pricing" / "[competitor] plans" — find official pricing pages
2. **Industry benchmarks**: "[industry] SaaS ARPU" / "[model] average pricing"
3. **Funding/revenue**: "[competitor] funding" / "[competitor] revenue" / "[competitor] ARR" — Crunchbase, GetLatka, similar
4. **Historical analogs**: "[analog co] early stage pricing" / "[analog co] seed round" — find early-stage comparables

Output:

### Competitor Pricing Benchmarks
For each competitor:
#### [Name]
| Dimension | Data | Source |
|-----------|------|--------|
| Pricing model | [free/subscription/usage-based/...] | [REF: SEARCH] URL |
| Price range | [$X-$Y/mo] | [REF: SEARCH] URL |
| Target user | [developers/enterprise/...] | [REF: SEARCH] URL |

### Industry Benchmarks
| Metric | Value | Source |
|--------|-------|--------|
| Average ARPU | $X/mo | [REF: SEARCH] URL |
| Typical conversion rate | X% | [REF: SEARCH] URL |

### Funding / Revenue Data
| Company | Stage | Amount | Valuation | Source |
|---------|-------|--------|-----------|--------|

### Pricing Guidance for Analyst
Based on above data, suggest a pricing reference for the Analyst (NO judgment, just a reference range).
"""


def build_evidence_hunter_prompt(idea: str, gap_finder_summary: str) -> str:
    return f"""Evidence Hunter — search for real-world evidence for each Gap Finder blind spot

Idea: {idea}

--- GAP FINDER BLIND SPOTS ---
{gap_finder_summary[:2000]}
--- END ---

Rules:
- You MUST NOT evaluate the original plan or respond to challenges. That's the Defender's job.
- You MUST NOT fabricate. If you can't find it, say so honestly.
- Your job: for each blind spot, is there real-world evidence that it's not as scary as claimed, or that someone has already solved it?
- Search each blind spot. 3-5 searches minimum per blind spot.

Search priority per blind spot:

1. **Precedent solutions**: "[blind spot keyword] startup solution" — has a startup already tackled this?
2. **Success despite**: "[similar product] despite [blind spot]" — cases where companies succeeded with the same blind spot
3. **Risk quantification**: "[blind spot] impact statistics" — actual probability and impact
4. **Mitigation strategies**: "[blind spot] mitigation strategy" — industry-standard mitigations

Output per blind spot:

### Blind Spot N: [Title from Gap Finder]

**Gap Finder severity**: ❌/⚠️/💡
**Search keywords used**: ...
**Results found**: X related results

**Evidence summary**:
| Evidence | Source | Supports / Confirms Risk / Neutral |
|----------|--------|------------------------------------|
| [finding 1] | [REF: SEARCH] URL | supports original plan / confirms risk / neutral |

**Conclusion**:
- Risk manageable ✅ / Risk confirmed, needs validation ⚠️ / Risk severe, priority fix ❌
- [one-line summary]

**Mitigation suggestion** (if applicable): [based on real cases found]
"""
