"""
Debate Consensus Logic
Pure-code consensus evaluation and Reviewer trigger rules. No LLM involved.

Voting system (2+1 with hidden veto):
- Challenger: gives score 1-10 (doesn't know it's a vote). Hidden veto at ≤3 (R1) or ≤4 (R2+).
- Analyst + Reviewer: binary vote PROCEED / REJECT
- Strategist: arbitrates only when Analyst/Reviewer deadlock 1:1
- Proposer + Defender: do not vote
- R1 cannot APPROVED (forced CONTINUE for minimum 2-round debate depth)

Ported from pipeline/debate_consensus.py — webapp version uses engine.core.debate_state.DebateState.
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from engine.core.debate_state import DebateState


# --- Default thresholds (can be overridden in config.json) ---
CHALLENGER_VETO_R1 = 3    # R1: score ≤ 3 = veto
CHALLENGER_VETO_R2 = 4    # R2+: score ≤ 4 = veto


def evaluate_consensus(
    round_num: int,
    challenger_score: int,
    analyst_vote: str,
    reviewer_vote: str,
    strategist_vote: str | None = None,
    config: dict | None = None,
) -> str:
    """
    Evaluate consensus under the 2+1 voting system.

    Args:
        round_num: Current round (1-3)
        challenger_score: 1-10 market viability score
        analyst_vote: "PROCEED" or "REJECT"
        reviewer_vote: "PROCEED" or "REJECT"
        strategist_vote: "PROCEED" or "REJECT" (only if arbitration triggered)
        config: Optional config for custom thresholds

    Returns: APPROVED, CONDITIONAL_APPROVED, REJECTED, CONTINUE, or DEADLOCK (needs arbitration)
    """
    veto_config = (config or {}).get("voting", {}).get("challenger_veto", {})
    veto_r1 = veto_config.get("round_1", CHALLENGER_VETO_R1)
    veto_r2 = veto_config.get("round_2_plus", CHALLENGER_VETO_R2)

    # Challenger hidden veto
    veto_line = veto_r1 if round_num == 1 else veto_r2
    if challenger_score <= veto_line:
        return "REJECTED"

    # R1: forced CONTINUE (minimum 2-round depth)
    if round_num == 1:
        return "CONTINUE"

    # R2-R3: Analyst + Reviewer binary vote
    if analyst_vote == "PROCEED" and reviewer_vote == "PROCEED":
        return "APPROVED"

    if analyst_vote == "REJECT" and reviewer_vote == "REJECT":
        return "REJECTED"

    # 1:1 deadlock → need Strategist arbitration
    if strategist_vote is None:
        return "DEADLOCK"

    # Arbitration result
    votes = [analyst_vote, reviewer_vote, strategist_vote]
    proceed_count = sum(1 for v in votes if v == "PROCEED")

    if proceed_count >= 2:
        return "CONDITIONAL_APPROVED"
    return "REJECTED"


def parse_challenger_score(output: str) -> int:
    """
    Extract challenger's market viability score from their output.
    Returns score 1-10, defaults to 5 if unparseable.
    """
    # Try structured JSON first
    try:
        data = json.loads(output)
        if isinstance(data, dict) and "score" in data:
            return max(1, min(10, int(data["score"])))
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    patterns = [
        r'["\']?score["\']?\s*[:：]\s*(\d+)',
        r'(\d+)\s*/\s*10',
        r'评分\s*[:：]\s*(\d+)',
        r'Challenger\s+Score\s*[:：]\s*(\d+)',
        r'市场可行性[评分]*\s*[:：]\s*(\d+)',
        r'viability\s*[:：]\s*(\d+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, output, re.IGNORECASE)
        if match:
            score = int(match.group(1))
            return max(1, min(10, score))

    return 5


def should_trigger_reviewer_attack(state: "DebateState", config: dict) -> bool:
    """
    Determine if Reviewer should participate in Phase B (assumption attack).

    Triggers (any one activates):
    1. Current round >= min_round (default 3)
    2. Previous round Analyst+Reviewer both voted PROCEED (near-consensus)
    3. Defender made major pivot last round
    4. Topic has high-risk tags
    """
    trigger_rules = config.get("reviewer", {}).get("trigger_rules", {})

    min_round = trigger_rules.get("min_round", 3)
    if state.current_round >= min_round:
        return True

    if state.current_round > 1 and trigger_rules.get("trigger_on_near_approval", True):
        prev_votes = state.get_last_votes()
        if prev_votes:
            analyst_prev = prev_votes.get("analyst", {}).get("vote")
            reviewer_prev = prev_votes.get("reviewer", {}).get("vote")
            if analyst_prev == "PROCEED" and reviewer_prev == "PROCEED":
                return True

    if state.defender_pivoted and trigger_rules.get("trigger_on_major_pivot", True):
        return True

    high_risk_tags = set(trigger_rules.get("high_risk_tags", []))
    if high_risk_tags & set(state.tags):
        return True

    return False


def check_hallucination_flags(reviewer_output: str) -> list[str]:
    """
    Parse Reviewer's fact-check output for hallucination flags.
    Returns list of flagged items (empty if none found).
    """
    flags = []
    for line in reviewer_output.split("\n"):
        if "幻觉风险" in line or "hallucination risk" in line.lower() or "❌" in line:
            cleaned = line.strip().lstrip("|").strip()
            if cleaned and ("幻觉风险" in cleaned or "hallucination risk" in cleaned.lower()):
                flags.append(cleaned)
    return flags


def detect_defender_pivot(defender_output: str) -> bool:
    """Detect if Defender made a major pivot based on output markers."""
    pivot_signals = ["🔄", "Pivot", "pivot", "更新版本", "重大调整", "EVOLVE", "evolve"]
    return any(signal in defender_output for signal in pivot_signals)


_NEGATION_TOKENS = (
    "not declared", "not triggered", "not applicable", "no pivot",
    "no change", "not required", "none", "n/a", "na.", "na ", "na\n",
    "no direction change", "not a pivot", "no pivot_out", "no direction_change",
    "not needed", "unnecessary", "status: no", "false",
)


def _is_negated_declaration(text_after_marker: str) -> bool:
    """
    After a marker like `DIRECTION_CHANGE:`, check if the immediate content is a
    negation ("Not Declared", "None", "N/A", etc.) — meaning the agent is explicitly
    NOT declaring a pivot, just echoing the instruction.
    """
    snippet = text_after_marker.strip().lstrip("*_#` \t").lower()[:80]
    if not snippet:
        return True  # empty content after marker = not a real declaration
    for tok in _NEGATION_TOKENS:
        if snippet.startswith(tok):
            return True
    return False


def detect_pivot_out(output: str, source: str) -> tuple[bool, str]:
    """
    Detect if an agent triggered a pivot-out.

    Must be a real self-declaration. Requires:
    - The marker with colon (`🔴 PIVOT_OUT:` or `PIVOT_OUT:`) AND
    - Located at start of output OR at start of a line AND
    - The content AFTER the colon is NOT a negation ("Not Declared", "No", "None", etc.)

    Sources and their markers:
    - proposer/defender: 🔴 PIVOT_OUT (self-declared)
    - challenger: 🔴 DIRECTION_CHANGE (detected Proposer shifted direction)

    Returns (is_pivot, reason).
    """
    marker_map = {
        "proposer": "PIVOT_OUT",
        "defender": "PIVOT_OUT",
        "challenger": "DIRECTION_CHANGE",
    }
    marker = marker_map.get(source)
    if not marker:
        return False, ""

    strict_patterns = [
        f"🔴 {marker}:",
        f"🔴{marker}:",
        f"{marker}:",
    ]
    head = output[:500]

    # Helper: validate a match by checking content after the colon
    def _validate_match(match_start_idx: int, marker_len: int) -> tuple[bool, str]:
        # Extract text after the colon
        after_colon_idx = output.find(":", match_start_idx) + 1
        following = output[after_colon_idx: after_colon_idx + 200]
        if _is_negated_declaration(following):
            return False, ""
        reason_text = output[match_start_idx: match_start_idx + 500].strip()
        return True, reason_text

    # Start-of-output match
    for p in strict_patterns:
        if p in head:
            idx = head.find(p)
            ok, reason = _validate_match(idx, len(p))
            if ok:
                return True, reason
            # keep searching in case another instance further down is real

    # Start-of-line match (after newline)
    import re
    for p in strict_patterns:
        for m in re.finditer(r"(?:\n|\r)\s*" + re.escape(p), output):
            idx = m.end() - len(p)
            ok, reason = _validate_match(idx, len(p))
            if ok:
                return True, reason

    return False, ""


def detect_logic_blocked(strategist_output: str) -> tuple[bool, str]:
    """
    Detect if Strategist returned a real LOGIC_BLOCKED signal.

    Must be a self-declaration (not a passing mention). Requires:
    - `LOGIC_BLOCKED` at the very start of output (first 50 chars, before headings)
      OR as the first non-whitespace token on any line starting with `LOGIC_BLOCKED:`
    - OR structured JSON {"status": "LOGIC_BLOCKED", ...}

    Returns (is_blocked, issues_description).
    """
    stripped = strategist_output.lstrip()
    # Strict: LOGIC_BLOCKED must be one of the very first tokens of the reply
    if stripped[:50].startswith("LOGIC_BLOCKED") or stripped[:50].startswith("## LOGIC_BLOCKED"):
        return True, strategist_output

    # Or at start of a line (with or without markdown heading)
    for line in strategist_output.splitlines()[:10]:  # only check first 10 lines
        s = line.strip().lstrip("#").strip()
        if s.startswith("LOGIC_BLOCKED:") or s.startswith("LOGIC_BLOCKED "):
            return True, strategist_output

    # Structured JSON response
    try:
        data = json.loads(strategist_output)
        if isinstance(data, dict) and data.get("status") == "LOGIC_BLOCKED":
            return True, data.get("issues", strategist_output)
    except (json.JSONDecodeError, TypeError):
        pass

    return False, ""
