"""
Synchronous unit tests for SESSION_CONFIG.Revenue_threshold override
in Prove debate prompts.

Regression guard for the bug where Analyst applied the hardcoded
$100K/year threshold even when SESSION_CONFIG specified a smaller
revenue target (e.g. Solo profile at $30K/year).
"""

from engine.core import debate_personas as P
from engine.core.debate_context import build_phase_b_analyst_prompt, build_phase_a_prompt
from engine.core.debate_state import DebateState


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
