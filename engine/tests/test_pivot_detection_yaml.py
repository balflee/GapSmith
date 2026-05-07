"""
Unit tests for YAML-verdict-block-based PIVOT_OUT detection.

Ports the test cases from Idea Generator commit 49cc2ac, which proved that
substring/regex-based PIVOT_OUT detection accumulates false-positives across
agent output variants (negation, markdown emphasis, stats table rows, quoted
discussion of the keyword) — and that each false-positive kills a full ~$3-5
debate run at REJECTED when the actual verdict was ADJUSTED.

The mandatory YAML verdict block reframes "did the agent declare a pivot?"
from a fragile substring search to a structured machine-readable declaration.

These tests lock in the correctness of:
- engine.core.validators.parse_verdict_block
- engine.core.validators.make_verdict_validator
- engine.core.debate_consensus.detect_pivot_out (now YAML-backed)
"""

from engine.core.validators import (
    parse_verdict_block,
    make_verdict_validator,
    VERDICT_STATUSES,
)
from engine.core.debate_consensus import detect_pivot_out


# ---------------------------------------------------------------
# parse_verdict_block — YAML extraction
# ---------------------------------------------------------------

def test_parse_verdict_block_simple():
    output = """Some defender response text here.

```yaml
status: ADJUSTED
reason_brief: "Conceded on TAM but core wedge holds"
```"""
    data = parse_verdict_block(output, "defender")
    assert data is not None
    assert data["status"] == "ADJUSTED"
    assert "TAM" in data["reason_brief"]


def test_parse_verdict_block_picks_last_yaml_fence():
    # If the agent quoted the format earlier (e.g. as part of explaining
    # the schema), only the LAST yaml fence with status: counts.
    output = """Defender response.

Earlier I considered:
```yaml
status: PIVOT_OUT
reason_brief: "example"
```

But after evidence search:

```yaml
status: STRENGTHENED
reason_brief: "Evidence supports the position"
```"""
    data = parse_verdict_block(output, "defender")
    assert data["status"] == "STRENGTHENED"


def test_parse_verdict_block_returns_none_when_missing():
    assert parse_verdict_block("Just plain markdown, no yaml block.", "defender") is None


def test_parse_verdict_block_returns_none_when_yaml_lacks_status():
    output = """```yaml
note: "this yaml has no status key"
```"""
    assert parse_verdict_block(output, "defender") is None


def test_parse_verdict_block_handles_yml_extension():
    # `yml` is a valid alias for yaml — agents might emit either.
    output = """```yml
status: ADJUSTING
reason_brief: "small refinement"
```"""
    data = parse_verdict_block(output, "proposer")
    assert data["status"] == "ADJUSTING"


# ---------------------------------------------------------------
# detect_pivot_out — false-positive cases that broke the regex-era detector
# ---------------------------------------------------------------

def test_stats_table_row_no_longer_false_positives():
    """The exact failure from Idea Generator's VB-RERUN-CREWLINE session:
    Defender output a stats table row "| 🔴 PIVOT_OUT | 0 |" (reporting
    zero pivots) — substring-based detector matched the keyword and killed
    the run at REJECTED when the actual verdict was ADJUSTED.

    YAML-block detection ignores the keyword anywhere in prose; only the
    structured declaration counts.
    """
    output = """## Defense Analysis

Stats summary:

| signal       | count |
| ------------ | ----- |
| 🔴 PIVOT_OUT | 0     |
| ✅ REFUTE    | 4     |
| ✅ AGREE     | 2     |

The team adjusted the pricing model to address Challenger's TAM concern.

```yaml
status: ADJUSTED
reason_brief: "Pricing model adjusted; TAM concern addressed"
```"""
    is_pivot, _reason = detect_pivot_out(output, "defender")
    assert is_pivot is False, "stats-table mention of keyword must not trigger pivot"


def test_markdown_emphasis_around_keyword_no_longer_false_positives():
    """Earlier regex iterations matched both `🔴 PIVOT_OUT` and
    `🔴 **PIVOT_OUT**` — but a Defender writing prose about the option
    while choosing ADJUSTED should still be ADJUSTED."""
    output = """The Challenger raised a 🔴 **PIVOT_OUT**-worthy critique on TAM,
but evidence search produced a counter that lets us continue.

```yaml
status: ADJUSTED
reason_brief: "Counter-evidence on TAM lets us continue"
```"""
    is_pivot, _ = detect_pivot_out(output, "defender")
    assert is_pivot is False


def test_negation_phrases_no_longer_false_positives():
    """"No PIVOT_OUT was needed" — historical false-positive class."""
    output = """No PIVOT_OUT was needed; the wedge is intact.

```yaml
status: STRENGTHENED
reason_brief: "All challenges refuted with evidence"
```"""
    is_pivot, _ = detect_pivot_out(output, "defender")
    assert is_pivot is False


# ---------------------------------------------------------------
# detect_pivot_out — true positives still trigger
# ---------------------------------------------------------------

def test_real_defender_pivot_triggers():
    output = """After exhaustive evidence search I cannot defend the TAM thesis.

```yaml
status: PIVOT_OUT
reason_brief: "TAM cannot be defended on primary sources; pivot to narrower wedge"
```"""
    is_pivot, reason = detect_pivot_out(output, "defender")
    assert is_pivot is True
    assert "TAM" in reason


def test_real_challenger_direction_change_triggers():
    output = """The Proposer's R2 plan no longer matches R1 — different target user, different wedge.

```yaml
status: DIRECTION_CHANGE
reason_brief: "Target user shifted from SMB to enterprise; this is a new idea"
```"""
    is_pivot, reason = detect_pivot_out(output, "challenger")
    assert is_pivot is True
    assert "Target user" in reason or "user" in reason


def test_real_proposer_pivot_triggers_in_r2_plus():
    output = """After Challenger's evidence I cannot maintain the original wedge.

```yaml
status: PIVOT_OUT
reason_brief: "Core thesis broken by competitive landscape data"
```"""
    is_pivot, reason = detect_pivot_out(output, "proposer")
    assert is_pivot is True


def test_proposer_adjusting_does_not_trigger():
    output = """Refining the pricing tier and target persona based on Challenger's points.

```yaml
status: ADJUSTING
reason_brief: "Pricing tier and persona refinement"
```"""
    is_pivot, _ = detect_pivot_out(output, "proposer")
    assert is_pivot is False


def test_defender_vulnerable_does_not_trigger():
    """VULNERABLE is honest acknowledgement, not abandonment — debate continues."""
    output = """Two unresolved challenges remain but the wedge survives.

```yaml
status: VULNERABLE
reason_brief: "Open: enterprise distribution and regulatory clarity"
```"""
    is_pivot, _ = detect_pivot_out(output, "defender")
    assert is_pivot is False


def test_challenger_continue_does_not_trigger():
    output = """Standard challenge round, original direction holds.

```yaml
status: CONTINUE
reason_brief: "No direction change; standard critique"
```"""
    is_pivot, _ = detect_pivot_out(output, "challenger")
    assert is_pivot is False


# ---------------------------------------------------------------
# make_verdict_validator — gate behavior
# ---------------------------------------------------------------

def test_validator_passes_on_valid_block():
    validator = make_verdict_validator("defender")
    output = """response

```yaml
status: ADJUSTED
reason_brief: "ok"
```"""
    ok, feedback = validator(output)
    assert ok is True
    assert feedback == ""


def test_validator_fails_when_block_missing():
    validator = make_verdict_validator("defender")
    ok, feedback = validator("just text, no yaml block")
    assert ok is False
    assert "verdict YAML block" in feedback
    # All four allowed defender statuses should be enumerated in the feedback
    for s in VERDICT_STATUSES["defender"]:
        assert s in feedback


def test_validator_fails_on_invalid_status_value():
    validator = make_verdict_validator("defender")
    output = """```yaml
status: WHATEVER
reason_brief: "agent invented its own status"
```"""
    ok, feedback = validator(output)
    assert ok is False
    assert "WHATEVER" in feedback
    assert "PIVOT_OUT" in feedback  # feedback should remind which statuses are allowed
    # Critical: feedback must explicitly tell the agent NOT to over-pivot
    assert "TERMINATING" in feedback or "nuclear" in feedback.lower() or "not pivot" in feedback.lower()


def test_validator_role_specific_enums():
    """Each role has different allowed statuses — Defender STRENGTHENED is
    valid for defender but invalid for proposer/challenger."""
    defender_validator = make_verdict_validator("defender")
    proposer_validator = make_verdict_validator("proposer")

    output = """```yaml
status: STRENGTHENED
reason_brief: ""
```"""
    assert defender_validator(output)[0] is True
    assert proposer_validator(output)[0] is False


# ---------------------------------------------------------------
# Smoke: roles without registered verdict map
# ---------------------------------------------------------------

def test_unknown_source_returns_false():
    """detect_pivot_out should be a no-op for non-pivot-emitting roles
    (analyst, reviewer, strategist, etc.) — they don't have a verdict map."""
    output = """```yaml
status: PIVOT_OUT
reason_brief: "but I'm not a pivot-emitting role"
```"""
    is_pivot, _ = detect_pivot_out(output, "analyst")
    assert is_pivot is False
