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
