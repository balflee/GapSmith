"""
Synchronous unit tests for SESSION_CONFIG override across Prove + Forge prompts.

Regression guard for the bug where Analyst applied the hardcoded
$100K/year threshold (and $10K / 4-8wk / 4-5 person constraints) even when
SESSION_CONFIG specified different values (e.g. Solo profile at $30K/year,
$3K budget). Covers all hardcoded spots in:
- engine/core/debate_personas.py    (ANALYST_SYSTEM, STRATEGIST_SYSTEM)
- engine/core/debate_context.py     (Phase A, Phase B Analyst, Strategist Phase 1/2, Contrarian)
- engine/core/debate_runner.py      (Step 2 cost, Step 3 final analysis)
- engine/core/ideation_runner.py    (Forge proposer/defender/strategist/screening)
"""

from engine.core import debate_personas as P
from engine.core.debate_context import (
    build_phase_a_prompt,
    build_phase_b_analyst_prompt,
    build_strategist_phase1_prompt,
    build_strategist_phase2_prompt,
)
from engine.core.debate_state import DebateState
from engine.core.ideation_runner import (
    _build_session_block,
    _build_proposer_prompt,
    _build_defender_prompt,
    _build_strategist_prompt,
    FACT_CLAIMS_RULE,
)


SOLO_CONFIG = (
    "## Project Profile\n"
    "Profile: Solo\n"
    "Budget: $3K\n"
    "Timeline: 2-4 weeks\n"
    "Revenue_threshold: $30K/year\n"
)


def _make_state(session_config: str = "", round_num: int = 1) -> DebateState:
    state = DebateState(
        session_id="test-session",
        idea="A simple test idea for prompt regression checks.",
        session_config=session_config,
    )
    state.current_round = round_num
    return state


# ---------------------------------------------------------------
# Persona system prompts
# ---------------------------------------------------------------

def test_analyst_persona_references_session_config_revenue_threshold():
    assert "SESSION_CONFIG.Revenue_threshold" in P.ANALYST_SYSTEM
    # Ensure the old authoritative line is gone
    assert "Revenue target: >$100K year-1 to pass ROI bar." not in P.ANALYST_SYSTEM


def test_strategist_persona_references_session_config_revenue_threshold():
    assert "SESSION_CONFIG.Revenue_threshold" in P.STRATEGIST_SYSTEM
    assert "Revenue projection must show >$100K year-1 math." not in P.STRATEGIST_SYSTEM


def test_strategist_persona_references_budget_and_timeline_overrides():
    assert "SESSION_CONFIG.Budget" in P.STRATEGIST_SYSTEM
    assert "SESSION_CONFIG.Timeline" in P.STRATEGIST_SYSTEM


# ---------------------------------------------------------------
# Phase B Analyst prompt builder
# ---------------------------------------------------------------

def test_phase_b_analyst_injects_solo_session_config():
    state = _make_state(SOLO_CONFIG)
    prompt = build_phase_b_analyst_prompt(state)

    # The session config block must be visible to the LLM
    assert "--- SESSION CONFIG ---" in prompt
    assert "Revenue_threshold: $30K/year" in prompt
    assert "Profile: Solo" in prompt

    # Override hint must be present in the constraints block
    assert "SESSION_CONFIG.Revenue_threshold" in prompt
    assert "else default $100K/yr" in prompt

    # Old hardcoded authoritative line must be gone
    assert "Year-1 revenue threshold: >$100K (below = LOW_ROI)" not in prompt


def test_phase_b_analyst_no_session_config_keeps_100k_default():
    state = _make_state("")
    prompt = build_phase_b_analyst_prompt(state)

    # No SESSION CONFIG block injected
    assert "--- SESSION CONFIG ---" not in prompt

    # But the constraints still mention the override mechanism + default fallback
    assert "SESSION_CONFIG.Revenue_threshold" in prompt
    assert "else default $100K/yr" in prompt


def test_phase_b_analyst_mentions_budget_and_team_overrides():
    state = _make_state(SOLO_CONFIG)
    prompt = build_phase_b_analyst_prompt(state)
    assert "SESSION_CONFIG.Budget" in prompt
    assert "SESSION_CONFIG.Team" in prompt or "SESSION_CONFIG.Timeline" in prompt


# ---------------------------------------------------------------
# Phase A Proposer prompt — sanity check that session_config still injected
# (existing behavior, regression guard)
# ---------------------------------------------------------------

def test_phase_a_proposer_injects_session_config():
    state = _make_state(SOLO_CONFIG)
    prompt = build_phase_a_prompt(state)
    assert "--- SESSION CONFIG (product modes / profile) ---" in prompt
    assert "Revenue_threshold: $30K/year" in prompt


def test_phase_a_proposer_skips_session_config_when_empty():
    state = _make_state("")
    prompt = build_phase_a_prompt(state)
    assert "--- SESSION CONFIG" not in prompt


# ---------------------------------------------------------------
# Phase B Step 3 — replicate the prompt construction from
# debate_runner._run_analyst_pipeline to guard the session_block injection.
# We can't easily import that helper without async deps, so we re-execute
# the exact f-string we shipped.
# ---------------------------------------------------------------

def _build_step3_prompt(state: DebateState, step1_content: str, step2_content: str, benchmark_data: str) -> str:
    benchmark_for_step3 = benchmark_data[:3000] if benchmark_data else ""
    session_block = f"\n\nSession Config:\n{state.session_config}\n" if state.session_config else ""
    return f"""Round {state.current_round} / Phase B / Step 3: Final Financial Analysis

Based on pricing benchmarks and cost structure, complete the full analysis.

Pricing benchmarks (from your search + Benchmark Hunter):
{step1_content[:3000]}
{benchmark_for_step3}

Cost structure (from your search):
{step2_content[:3000]}{session_block}

Complete:
1. Lean Feasibility: 🟢 LEAN_FIT / 🟡 STRETCH / 🔴 NOT_LEAN
2. Revenue model (at least 2 scenarios: pessimistic/base, with estimation logic)
3. ROI + break-even: 🟢 HIGH_ROI / 🟡 MED_ROI / 🔴 LOW_ROI
4. Critical assumptions (3-5 "if wrong, conclusion changes" items)
5. Final verdict: VIABLE / MARGINAL / NOT_VIABLE

Year-1 revenue threshold: use `SESSION_CONFIG.Revenue_threshold` if provided in the Session Config block above (e.g. Solo $30K/yr, Founder Couple $50K/yr); otherwise default $100K/yr. Below threshold = LOW_ROI."""


def test_step3_prompt_injects_session_config():
    state = _make_state(SOLO_CONFIG)
    prompt = _build_step3_prompt(state, "step1 content", "step2 content", "bench data")
    assert "Session Config:" in prompt
    assert "Revenue_threshold: $30K/year" in prompt
    assert "SESSION_CONFIG.Revenue_threshold" in prompt
    assert "otherwise default $100K/yr" in prompt


def test_step3_prompt_no_session_config_keeps_default():
    state = _make_state("")
    prompt = _build_step3_prompt(state, "step1 content", "step2 content", "bench data")
    assert "Session Config:" not in prompt
    assert "SESSION_CONFIG.Revenue_threshold" in prompt
    assert "otherwise default $100K/yr" in prompt


# ---------------------------------------------------------------
# Prove proportional LEAN_FIT scoring (debate_context Phase B Analyst)
# ---------------------------------------------------------------

def test_phase_b_analyst_lean_fit_is_proportional_to_budget():
    """LEAN_FIT band must scale with SESSION_CONFIG.Budget, not be hardcoded $10K."""
    state = _make_state(SOLO_CONFIG)
    prompt = build_phase_b_analyst_prompt(state)
    assert "Lean Feasibility Check" in prompt
    # The new prompt names Budget as the bar, with 2.5× as STRETCH ceiling.
    assert "Budget" in prompt
    assert "Budget × 2.5" in prompt or "× 2.5" in prompt
    # Default fallback line still mentions $10K explicitly so empty config works.
    assert "default Budget = $10K" in prompt
    # Old fixed-band line must be gone.
    assert "🟢 LEAN_FIT ($10K possible) / 🟡 STRETCH ($10-25K) / 🔴 NOT_LEAN (>$25K)" not in prompt


# ---------------------------------------------------------------
# Strategist Phase 1 + 2 prompts
# ---------------------------------------------------------------

def test_strategist_phase1_injects_session_config():
    state = _make_state(SOLO_CONFIG)
    state.discussion = "(stub discussion)"
    state.consensus_snapshot = ""
    prompt = build_strategist_phase1_prompt(state)
    assert "SESSION CONFIG (user's actual constraints" in prompt
    assert "Revenue_threshold: $30K/year" in prompt


def test_strategist_phase1_skips_session_config_when_empty():
    state = _make_state("")
    state.discussion = "(stub discussion)"
    state.consensus_snapshot = ""
    prompt = build_strategist_phase1_prompt(state)
    assert "SESSION CONFIG (user's actual constraints" not in prompt


def test_strategist_phase2_injects_session_config():
    state = _make_state(SOLO_CONFIG)
    prompt = build_strategist_phase2_prompt(state, None, "(phase 1 analysis stub)")
    assert "SESSION CONFIG (user's actual constraints" in prompt
    assert "Profile: Solo" in prompt
    # Budget table line must now reference SESSION_CONFIG override
    assert "SESSION_CONFIG.Budget" in prompt


# ---------------------------------------------------------------
# Forge (ideation_runner) — _build_session_block helper
# ---------------------------------------------------------------

def test_session_block_helper_emits_block_with_config():
    block = _build_session_block(SOLO_CONFIG)
    assert "--- SESSION CONFIG" in block
    assert "Revenue_threshold: $30K/year" in block
    assert "--- END SESSION CONFIG" in block
    assert "overrides defaults" in block


def test_session_block_helper_returns_empty_for_blank_config():
    assert _build_session_block("") == ""
    assert _build_session_block("   \n  ") == ""


# ---------------------------------------------------------------
# Forge prompt builders honor SESSION_CONFIG
# ---------------------------------------------------------------

def test_forge_proposer_round2_injects_session_config():
    prompt = _build_proposer_prompt(2, "## context here", "(prev defender)", SOLO_CONFIG)
    assert "--- SESSION CONFIG" in prompt
    assert "Revenue_threshold: $30K/year" in prompt


def test_forge_proposer_round3_injects_session_config():
    prompt = _build_proposer_prompt(3, "## context here", "(prev defender)", SOLO_CONFIG)
    assert "Revenue_threshold: $30K/year" in prompt


def test_forge_proposer_round5_injects_session_config():
    prompt = _build_proposer_prompt(5, "ctx", "prev defender", SOLO_CONFIG)
    assert "Revenue_threshold: $30K/year" in prompt


def test_forge_proposer_no_session_config_leaves_prompt_clean():
    """Without session_config, no SESSION CONFIG block should appear."""
    prompt = _build_proposer_prompt(2, "## context here", "(prev defender)", "")
    assert "--- SESSION CONFIG" not in prompt


def test_forge_defender_round3_business_model_references_revenue_threshold():
    """Round 3 (Business Model Deep-Dive) must cross-check pricing vs SESSION_CONFIG.Revenue_threshold."""
    prompt = _build_defender_prompt(3, "(proposer output)", "ctx", SOLO_CONFIG)
    assert "Revenue_threshold: $30K/year" in prompt
    assert "Revenue_threshold" in prompt  # mentioned in instructions


def test_forge_strategist_injects_session_config_and_proportional_lean_fit():
    prompt = _build_strategist_prompt("ctx", "(brainstorm)", SOLO_CONFIG)
    assert "Revenue_threshold: $30K/year" in prompt
    # Proportional LEAN_FIT bands must be present
    assert "LEAN_FIT" in prompt
    assert "Budget" in prompt
    # Old fixed-band wording must be gone
    assert "LEAN_FIT ($10K, 4-8wk) | STRETCH ($10-25K, 8-12wk) | NOT_LEAN (>$25K, >12wk)" not in prompt


def test_forge_strategist_no_session_config_keeps_default():
    prompt = _build_strategist_prompt("ctx", "(brainstorm)", "")
    assert "--- SESSION CONFIG" not in prompt
    # Default fallback ($10K / 4-8 weeks) must still be mentioned in lean_feasibility guidance
    assert "default" in prompt.lower()
    assert "$10K" in prompt


# ---------------------------------------------------------------
# FACT_CLAIMS source-link rule injected into the prompts most likely
# to invite hallucinated competitor names + pricing.
# ---------------------------------------------------------------

def _expects_fact_rule(prompt: str) -> None:
    """Each rule-bearing prompt must spell out the three required clauses."""
    assert "Hard-Fact Citation Rule" in prompt
    assert "[REF: SEARCH] URL" in prompt
    assert "[assumption]" in prompt


def test_fact_claims_rule_constant_has_required_clauses():
    """The shared rule string itself must mention all three options."""
    _expects_fact_rule(FACT_CLAIMS_RULE)
    # It must call out the categories of hard facts so the LLM knows what to cite.
    for kw in ["pricing", "funding", "market sizes"]:
        assert kw in FACT_CLAIMS_RULE


def test_forge_proposer_r2_through_r5_carry_fact_rule():
    for r in (2, 3, 4, 5):
        prompt = _build_proposer_prompt(r, "ctx", "prev defender", "")
        _expects_fact_rule(prompt)


def test_forge_defender_r3_business_model_carries_fact_rule():
    """Round 3 Business Model is where Defender asks for competitor pricing —
    the worst hallucination zone."""
    prompt = _build_defender_prompt(3, "(proposer output)", "ctx", "")
    _expects_fact_rule(prompt)
    # Must also explicitly tell Defender to source competitor pricing from upstream
    # search results, not invent.
    assert "MUST come from the upstream Proposer search results" in prompt


def test_forge_strategist_carries_fact_rule_targeted_at_final_fields():
    """Strategist final JSON is the user-visible deliverable. Rule must
    explicitly guard the four hallucination-prone JSON fields."""
    prompt = _build_strategist_prompt("ctx", "(brainstorm)", "")
    _expects_fact_rule(prompt)
    assert "revenue_model" in prompt
    assert "competitive_landscape" in prompt
    assert "target_market" in prompt


def test_forge_defender_r1_r2_r4_r5_do_not_have_fact_rule():
    """Only R3 Defender (Business Model Deep-Dive) needs FACT_CLAIMS — other
    Defender rounds are creative-coach feedback that doesn't generate hard facts.
    Adding the rule there would just bloat tokens."""
    for r in (1, 2, 4, 5):
        prompt = _build_defender_prompt(r, "(proposer output)", "ctx", "")
        assert "Hard-Fact Citation Rule" not in prompt, (
            f"R{r} Defender should not carry FACT_CLAIMS — only R3 (Business Model) does"
        )


# ---------------------------------------------------------------
# Vote-condition dedup (debate_runner._dedup_conditions)
# Catches semantic duplicates that dict.fromkeys() misses.
# ---------------------------------------------------------------

from engine.core.debate_runner import _dedup_conditions


def test_dedup_real_world_case_caught_in_77520303():
    """Real case from prove_session 77520303-...: two voters produced the
    same condition with different wording around the dollar figure."""
    a = "Complete at least 3 manual margin audits proving $1,000+/month in identifiable margin leakage or recoverable profit for target Shopify + Amazon merchants."
    b = "Complete at least 3 manual margin audits proving identifiable or recoverable leakage of at least $1,000-$5,000/month for target merchants."
    out = _dedup_conditions([a, b])
    assert len(out) == 1
    # First occurrence's full wording wins.
    assert out[0] == a


def test_dedup_keeps_distinct_conditions():
    items = [
        "Validate willingness to pay within 4 weeks of demos.",
        "Land 3 paying merchants in 8 weeks.",
        "Confirm Shopify partner ecosystem demand signal.",
    ]
    assert _dedup_conditions(items) == items


def test_dedup_handles_exact_duplicates():
    out = _dedup_conditions(["Same condition", "Same condition", "Same condition"])
    assert out == ["Same condition"]


def test_dedup_handles_empty_and_non_strings():
    out = _dedup_conditions(["", "   ", None, "Real one", "Real one"])
    assert out == ["Real one"]


def test_dedup_respects_max_results():
    items = [f"Distinct prefix {i} unique tail words here" for i in range(20)]
    out = _dedup_conditions(items, max_results=5)
    assert len(out) == 5


def test_dedup_preserves_meaningful_number_differences():
    """Numbers are NOT stripped — '3 weeks' and '8 weeks' should stay distinct
    when the rest of the condition is identical."""
    a = "Validate willingness to pay within 3 weeks of demos."
    b = "Validate willingness to pay within 8 weeks of demos."
    out = _dedup_conditions([a, b])
    # First 8 normalized words: "validate willingness to pay within 3 weeks of"
    #                            "validate willingness to pay within 8 weeks of"
    # The "3" vs "8" differs at word 6, so both are kept.
    assert len(out) == 2


# ---------------------------------------------------------------
# Forge screening winner / rank invariants — regression for
# 4 prior production cases where the higher-RICE idea was demoted
# behind the Strategist's original rank-1 idea (e.g. session
# 0e13c9bd: AgentMeter total 322 vs ShipGuard 266, but ShipGuard
# stayed as rank-1 and `winner` field).
#
# We can't run the full async pipeline in unit tests, but we CAN
# replay the deterministic post-RICE decision block on a fixture
# of agent_scores to verify the invariants hold.
# ---------------------------------------------------------------

def _replay_screening_decision(
    remaining_ideas: list[dict],
    agent_scores: dict[str, dict],
    cascade_winner_key: str,
):
    """Mirrors the decision block in _run_screening() so the invariants
    can be tested without spinning up async LLM calls.

    Returns (final_ideas, screening_details).
    """
    # _total_score (mirrors the inner function in _run_screening)
    def total_score(key):
        return sum(s.get(key, {}).get("total", 0) for s in agent_scores.values())

    pre_a = remaining_ideas[0]["name"] if remaining_ideas else ""
    pre_b = remaining_ideas[1]["name"] if len(remaining_ideas) > 1 else ""

    final_a = total_score("idea_a")
    final_b = total_score("idea_b")
    winner_key = cascade_winner_key
    if agent_scores and abs(final_a - final_b) > 0.5:
        expected = "idea_a" if final_a > final_b else "idea_b"
        if winner_key != expected:
            winner_key = expected

    if winner_key == "idea_b":
        remaining_ideas = [remaining_ideas[1], remaining_ideas[0]]

    final_ideas = []
    for i, idea in enumerate(remaining_ideas[:2]):
        idea["rank"] = i + 1
        final_ideas.append(idea)

    screening_details = {
        "rice_idea_a": pre_a,
        "rice_idea_b": pre_b,
        "rice_total_a": round(final_a) if agent_scores else 0,
        "rice_total_b": round(final_b) if agent_scores else 0,
        "winner": final_ideas[0]["name"] if final_ideas else "",
    }
    return final_ideas, screening_details


# Real-world fixture from session 0e13c9bd-c39b-44d4-b97f-06549baa6245
SESSION_0E13_AGENT_SCORES = {
    "proposer":   {"idea_a": {"total": 42},  "idea_b": {"total": 130}},
    "challenger": {"idea_a": {"total": 24},  "idea_b": {"total": 42}},
    "analyst":    {"idea_a": {"total": 78},  "idea_b": {"total": 35}},
    "defender":   {"idea_a": {"total": 102}, "idea_b": {"total": 74}},
    "reviewer":   {"idea_a": {"total": 20},  "idea_b": {"total": 42}},
}


def test_screening_higher_summed_idea_b_wins_even_if_cascade_returned_idea_a():
    """The historical bug: cascade somehow returned 'idea_a' (ShipGuard) but
    summed totals clearly favored 'idea_b' (AgentMeter, 323 vs 266). The
    safety override must flip the winner."""
    ideas = [{"name": "ShipGuard"}, {"name": "AgentMeter"}]
    final_ideas, det = _replay_screening_decision(
        ideas, SESSION_0E13_AGENT_SCORES, cascade_winner_key="idea_a"
    )
    assert det["winner"] == "AgentMeter"
    assert final_ideas[0]["name"] == "AgentMeter"
    assert final_ideas[0]["rank"] == 1
    assert final_ideas[1]["name"] == "ShipGuard"
    assert final_ideas[1]["rank"] == 2


def test_screening_label_total_pairing_after_reorder():
    """After reorder, rice_idea_a / rice_total_a must still refer to the
    SAME idea (the one labelled 'idea_a' in the LLM prompt), not get
    swapped with the winner. Frontend's `aWins = total_a >= total_b`
    should still work."""
    ideas = [{"name": "ShipGuard"}, {"name": "AgentMeter"}]
    _, det = _replay_screening_decision(
        ideas, SESSION_0E13_AGENT_SCORES, cascade_winner_key="idea_a"
    )
    # The LLM saw ShipGuard as idea_a and scored it. Label and total must agree:
    assert det["rice_idea_a"] == "ShipGuard"
    assert det["rice_total_a"] == 266
    assert det["rice_idea_b"] == "AgentMeter"
    assert det["rice_total_b"] == 323
    # Frontend WINNER badge (a >= b) still resolves to the right side:
    a_wins = det["rice_total_a"] >= det["rice_total_b"]
    assert a_wins is False  # AgentMeter (rice_idea_b) should win badge
    assert det["winner"] == "AgentMeter"


def test_screening_no_override_when_cascade_agrees_with_summed():
    """When cascade already picks the higher-summed idea, no override fires."""
    ideas = [{"name": "ShipGuard"}, {"name": "AgentMeter"}]
    _, det = _replay_screening_decision(
        ideas, SESSION_0E13_AGENT_SCORES, cascade_winner_key="idea_b"
    )
    assert det["winner"] == "AgentMeter"


def test_screening_no_override_on_near_tie():
    """A 0.5 difference is treated as a tie — cascade winner is respected
    (avoids flipping on float-rounding noise)."""
    near_tie = {
        "proposer":   {"idea_a": {"total": 50}, "idea_b": {"total": 50}},
        "challenger": {"idea_a": {"total": 50}, "idea_b": {"total": 50.4}},
    }
    ideas = [{"name": "A"}, {"name": "B"}]
    _, det = _replay_screening_decision(ideas, near_tie, cascade_winner_key="idea_a")
    # Cascade said A wins; near-tie respects the cascade.
    assert det["winner"] == "A"


def test_screening_handles_idea_a_clearly_higher():
    """A=400, B=200 → A wins regardless of cascade."""
    scores = {
        "proposer":   {"idea_a": {"total": 100}, "idea_b": {"total": 50}},
        "challenger": {"idea_a": {"total": 100}, "idea_b": {"total": 50}},
        "analyst":    {"idea_a": {"total": 100}, "idea_b": {"total": 50}},
        "defender":   {"idea_a": {"total": 100}, "idea_b": {"total": 50}},
    }
    ideas = [{"name": "A"}, {"name": "B"}]
    # Even if cascade somehow said idea_b:
    _, det = _replay_screening_decision(ideas, scores, cascade_winner_key="idea_b")
    assert det["winner"] == "A"
    assert det["rice_total_a"] == 400
    assert det["rice_total_b"] == 200
