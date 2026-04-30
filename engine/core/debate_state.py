"""
DebateState — in-memory state object for Prove multi-agent debate.
Replaces CLI's file-based DebateState (pipeline/debate_state.py).

Everything lives in memory during a single background task execution.
Persistence to Supabase happens via providers.storage.save_prove_results().
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class DebateState:
    session_id: str
    idea: str
    session_config: str = ""  # product mode / profile (optional context)
    tags: list[str] = field(default_factory=list)

    # Progress tracking
    current_round: int = 1
    current_phase: str = "A"  # A, A5, B, C, D, STRATEGIST, MINI_ROUND, DONE
    consensus: str = "PENDING"  # PENDING, CONTINUE, APPROVED, CONDITIONAL_APPROVED, REJECTED

    # Round-level flags
    logic_blocked_count: int = 0
    reviewer_attack_triggered: bool = False
    defender_pivoted: bool = False

    # Per-round outputs: {(round_num, phase, agent) -> content}
    phase_outputs: dict = field(default_factory=dict)

    # Sub-agent outputs: {(round_num, sub_agent_name) -> content}
    sub_agent_outputs: dict = field(default_factory=dict)

    # Full discussion markdown (accumulates across rounds/phases)
    discussion: str = ""

    # Consensus snapshot (rolling summary)
    consensus_snapshot: str = ""

    # Voting history: list of per-round vote dicts
    # e.g., [{"round": 2, "challenger": {"score": 7}, "analyst": {"vote": "PROCEED", "reason": "..."}, "reviewer": {...}}]
    votes_history: list = field(default_factory=list)

    # KB: round_num -> {agent -> content} (for R2+ Proposer to read R1 data)
    kb: dict = field(default_factory=dict)

    # Round summaries (optional, extracted post-hoc)
    round_summaries: dict = field(default_factory=dict)  # round_num -> summary text

    # Error log
    error_log: list = field(default_factory=list)

    # Hallucination flags from Phase A.5
    hallucination_flags: dict = field(default_factory=dict)  # round_num -> list[str]

    created_at: str = ""

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now(timezone.utc).isoformat()

    # --- Phase output helpers ---

    def _key(self, round_num: int, phase: str, agent: str) -> tuple:
        return (round_num, phase, agent)

    def get_output(self, round_num: int, phase: str, agent: str) -> str | None:
        return self.phase_outputs.get(self._key(round_num, phase, agent))

    def set_output(self, round_num: int, phase: str, agent: str, content: str) -> None:
        self.phase_outputs[self._key(round_num, phase, agent)] = content

    # --- Sub-agent helpers ---

    def get_sub_agent(self, round_num: int, name: str) -> str | None:
        return self.sub_agent_outputs.get((round_num, name))

    def set_sub_agent(self, round_num: int, name: str, content: str) -> None:
        self.sub_agent_outputs[(round_num, name)] = content

    # --- Discussion helpers ---

    def append_discussion(self, round_num: int, phase: str, agent: str, text: str) -> None:
        header = f"\n\n## Round {round_num} - Phase {phase} - {agent.title()}\n\n"
        self.discussion += header + text

    # --- KB helpers ---

    def kb_store(self, round_num: int, agent: str, content: str) -> None:
        if round_num not in self.kb:
            self.kb[round_num] = {}
        self.kb[round_num][agent] = content

    def kb_get(self, round_num: int, agent: str) -> str | None:
        return self.kb.get(round_num, {}).get(agent)

    def kb_get_round(self, round_num: int) -> dict:
        return self.kb.get(round_num, {})

    # --- Vote helpers ---

    def add_votes(self, round_num: int, votes: dict) -> None:
        """votes is a dict like {"challenger": {"score": 7}, "analyst": {"vote": "PROCEED", ...}, ...}"""
        self.votes_history.append({"round": round_num, **votes})

    def get_last_votes(self) -> dict | None:
        """Returns the most recent round's votes, stripped of the 'round' key."""
        if not self.votes_history:
            return None
        last = dict(self.votes_history[-1])
        last.pop("round", None)
        return last

    # --- Round summary helpers ---

    def set_round_summary(self, round_num: int, summary: str) -> None:
        self.round_summaries[round_num] = summary

    def get_round_summary(self, round_num: int) -> str:
        return self.round_summaries.get(round_num, "")

    # --- Context builders for prompts ---

    def get_previous_round_full(self) -> str:
        """Collect all Phase A/A5/B/C outputs from the previous round."""
        if self.current_round <= 1:
            return ""
        prev = self.current_round - 1
        parts = []
        for phase in ("A", "A5", "B_challenger", "B_analyst", "B_reviewer", "C"):
            for agent in ("proposer", "reviewer", "challenger", "analyst", "defender"):
                content = self.get_output(prev, phase, agent)
                if content:
                    parts.append(f"### Round {prev} — {phase} — {agent.title()}\n\n{content}")
        return "\n\n".join(parts)

    def get_unresolved_questions(self) -> str:
        """Extract unresolved section from consensus snapshot."""
        if not self.consensus_snapshot:
            return ""
        match = re.search(
            r'(?:Unresolved|未解决).*?\n(.*?)(?=\n##|\Z)',
            self.consensus_snapshot,
            re.IGNORECASE | re.DOTALL,
        )
        return match.group(1).strip() if match else ""

    def update_consensus_snapshot(self, resolved: list, unresolved: list, positions: dict) -> None:
        """Update the rolling consensus snapshot at the top of discussion."""
        lines = [f"# Round {self.current_round} Consensus Snapshot", ""]
        if resolved:
            lines.append("## Resolved")
            lines.extend(f"- {r}" for r in resolved)
            lines.append("")
        if unresolved:
            lines.append("## Unresolved Questions")
            lines.extend(f"- {u}" for u in unresolved)
            lines.append("")
        if positions:
            lines.append("## Agent Positions")
            for agent, pos in positions.items():
                lines.append(f"- **{agent}**: {pos}")
        self.consensus_snapshot = "\n".join(lines)
