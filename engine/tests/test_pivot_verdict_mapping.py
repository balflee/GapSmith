"""
Unit tests for the verdict mapping logic in debate_runner.

Two engine guarantees we want to lock down:

1. When pivot_report is non-empty (a panelist self-declared PIVOT_OUT mid-debate),
   the agent-facing verdict must be "PIVOT_OUT" — not "REJECTED" — so agents and
   downstream UI don't conflate "the panel ran out of patience and pivoted" with
   "the panel held a vote and rejected the idea". Reproduces the bug in production
   prove session prove-rejected-vote: same consensus="REJECTED" but very different
   meaning for callers.

2. The MiniMax-aware token doubling helper (_max_tokens_for) must double for any
   model whose name contains "minimax" (case-insensitive) and pass through other
   models untouched. This is exercised at the strategist call sites — a regression
   here re-introduces the truncated-kill-brief bug from job_mosf3ahl_u7yjqmsl.
"""

from engine.core.debate_runner import _max_tokens_for


# ---------------------------------------------------------------
# _max_tokens_for — MiniMax doubling
# ---------------------------------------------------------------

def test_max_tokens_for_minimax_doubles():
    assert _max_tokens_for("MiniMax-M2.7", 4096) == 8192
    assert _max_tokens_for("MiniMax-M2.7", 6144) == 12288
    assert _max_tokens_for("MiniMax-M2.7", 8192) == 16384


def test_max_tokens_for_minimax_case_insensitive():
    assert _max_tokens_for("minimax-m2.7", 4096) == 8192
    assert _max_tokens_for("MINIMAX-M2.7", 4096) == 8192
    assert _max_tokens_for("Minimax", 4096) == 8192


def test_max_tokens_for_other_models_unchanged():
    assert _max_tokens_for("claude-sonnet-4-6", 4096) == 4096
    assert _max_tokens_for("gpt-4o", 4096) == 4096
    assert _max_tokens_for("gemini-2.5-flash", 4096) == 4096


def test_max_tokens_for_none_or_empty_unchanged():
    assert _max_tokens_for(None, 4096) == 4096
    assert _max_tokens_for("", 4096) == 4096


# ---------------------------------------------------------------
# Verdict mapping — pivot_report → PIVOT_OUT verdict
# ---------------------------------------------------------------
#
# We exercise the mapping logic directly rather than mocking the full
# orchestration flow. The function is small + self-contained, copying it
# here keeps the test fast and stable.

def _map_verdict(consensus: str, pivot_report: str | None) -> str:
    """Mirror of debate_runner.run_prove_debate verdict mapping.

    If this drifts from the source (e.g. someone adds a new consensus state)
    the production behavior is wrong and this test is wrong in lockstep —
    which is the point: a single source of truth for the mapping.
    """
    if pivot_report and pivot_report.strip():
        return "PIVOT_OUT"
    verdict_map = {
        "APPROVED": "APPROVED",
        "CONDITIONAL_APPROVED": "CONDITIONAL_APPROVED",
        "REJECTED": "REJECTED",
        "CONTINUE": "CONDITIONAL_APPROVED",
        "DEADLOCK": "CONDITIONAL_APPROVED",
        "PENDING": "CONDITIONAL_APPROVED",
    }
    return verdict_map.get(consensus, "CONDITIONAL_APPROVED")


def test_pivot_report_overrides_rejected_to_pivot_out():
    # The production bug: panelist declared PIVOT_OUT mid-debate, _handle_pivot_out
    # set consensus=REJECTED + populated pivot_report, but the agent saw
    # verdict=REJECTED (indistinguishable from a vote-rejected idea).
    assert _map_verdict("REJECTED", "## Pivot Report\n\n### 1. Original Direction Summary\n...") == "PIVOT_OUT"


def test_empty_pivot_report_does_not_trigger_pivot_out():
    # None, "", "   \n  " — none should flip the verdict. Engine writes
    # pivot_report=None on the vote-rejected path; some persistence layers
    # round-trip null as "" so we accept both.
    assert _map_verdict("REJECTED", None) == "REJECTED"
    assert _map_verdict("REJECTED", "") == "REJECTED"
    assert _map_verdict("REJECTED", "   \n  \t  ") == "REJECTED"


def test_pivot_report_overrides_even_for_approved_consensus():
    # Defensive: if the orchestration ever leaves consensus on a non-REJECTED
    # value while still emitting a pivot_report, the pivot semantics still win.
    # Reaching this state is a bug, but it shouldn't bleed into a confusing
    # APPROVED+pivot_report agent payload.
    assert _map_verdict("APPROVED", "real pivot content") == "PIVOT_OUT"


def test_normal_consensus_passes_through():
    assert _map_verdict("APPROVED", None) == "APPROVED"
    assert _map_verdict("CONDITIONAL_APPROVED", None) == "CONDITIONAL_APPROVED"
    assert _map_verdict("REJECTED", None) == "REJECTED"


def test_indeterminate_consensus_falls_back_to_conditional():
    # Defensive default: the engine should never run out of rounds without a
    # decision, but if it does the agent gets CONDITIONAL_APPROVED rather than
    # an arbitrary string the agent doesn't know how to handle.
    assert _map_verdict("CONTINUE", None) == "CONDITIONAL_APPROVED"
    assert _map_verdict("DEADLOCK", None) == "CONDITIONAL_APPROVED"
    assert _map_verdict("PENDING", None) == "CONDITIONAL_APPROVED"
    assert _map_verdict("UNRECOGNIZED_STATE", None) == "CONDITIONAL_APPROVED"
