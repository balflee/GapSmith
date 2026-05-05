"""
Manual smoke test for the PIVOT_OUT path — runs in <1 second, no payment,
no engine HTTP, no LLM API. Exercises the real run_debate orchestration
with stub providers so we can see end-to-end:
  1. detect_pivot_out fires (we monkey-patch it to True after R2 Phase A)
  2. _handle_pivot_out builds a pivot_report via the stub LLM
  3. verdict_map override flips consensus=REJECTED to verdict="PIVOT_OUT"
  4. Final payload has report.pivot_report populated and verdict="PIVOT_OUT"

Run with:  python -m engine.tests.manual_pivot_smoke
"""

import asyncio
from types import SimpleNamespace

from engine.core import debate_consensus as cons
from engine.core import debate_runner
from engine.core.debate_runner import run_debate


class StubLLMResp:
    def __init__(self, content: str, model: str = "stub-model"):
        self.content = content
        self.model = model
        self.input_tokens = 100
        self.output_tokens = 200
        self.total_tokens = 300
        self.cost_usd = 0.0


class StubLLM:
    """Returns canned responses based on which prompt comes in.

    The router uses substring matches against the prompt so the test stays
    stable when prompts get edited — only the rough phase intent matters.
    """
    default_model = "stub-model"
    provider = "stub"

    def __init__(self):
        self.calls: list[str] = []

    async def call(self, prompt: str, model: str | None = None, **kw):
        self.calls.append(prompt[:80])
        # Strategist pivot prompt → return a non-empty pivot report so
        # verdict_map flips to PIVOT_OUT.
        if "Pivot Report" in prompt or "Strategist — Pivot Report" in prompt:
            return StubLLMResp(
                "## Pivot Report\n\n"
                "### 1. Original Direction Summary\nThe original idea was X.\n\n"
                "### 2. Why Abandoned\nThe Defender could not refute the Challenger's TAM critique.\n\n"
                "### 3. New Direction Suggestion\nPivot to Y, focused on a smaller verifiable wedge.\n\n"
                "### 4. Suggested INPUT for New Session\n```\nBuild Y for narrow customer segment Z.\n```\n\n"
                "### 5. Lessons\nValidate TAM with primary sources before committing to a thesis.\n",
            )
        # Phase A Trend Scout / Proposer — return a proposer brief
        if "Proposer" in prompt or "Phase A" in prompt or "Trend Scout" in prompt:
            return StubLLMResp("Proposer brief: idea X targets segment Y with model Z.")
        # Reviewer fact-check — clean output
        if "fact-check" in prompt.lower() or "Reviewer" in prompt:
            return StubLLMResp("No hallucinations detected. Sources verified.")
        # Default — short generic content so loops don't crash on empty
        return StubLLMResp("Generic stub response for testing pivot path.")


class StubStorage:
    """No-op storage — captures the final save call so we can inspect it."""
    def __init__(self):
        self.saved_session_id: str | None = None
        self.saved_verdict: str | None = None
        self.saved_report: dict | None = None

    async def update_status(self, *a, **kw):
        pass

    async def append_round(self, *a, **kw):
        pass

    async def save_prove_results(
        self, *, session_id, rounds, votes, verdict, report, **kw,
    ):
        self.saved_session_id = session_id
        self.saved_verdict = verdict
        self.saved_report = report


async def main():
    storage = StubStorage()
    llm = StubLLM()
    providers = SimpleNamespace(
        llm=llm,
        storage=storage,
        model="stub-model",
        search=None,
    )

    # Force pivot detection to fire on the very first detect_pivot_out call
    # after Phase A. This short-circuits R1 (which never checks pivot per the
    # `if round_num > 1` guard at debate_runner.py:1086) — we need the engine
    # to start round 2 first. Approach: monkey-patch detect_pivot_out to
    # return True only when source=="proposer" AND we've crossed into R2.
    state_box = {"r": 0}
    real_run_phase_a = debate_runner.run_phase_a

    async def tracking_phase_a(state, prov):
        state_box["r"] = state.current_round
        return await real_run_phase_a(state, prov)

    debate_runner.run_phase_a = tracking_phase_a  # type: ignore[assignment]

    real_detect = cons.detect_pivot_out

    def force_pivot(output: str, source: str):
        if source == "proposer" and state_box["r"] >= 2:
            return True, "🔴 PIVOT_OUT: TAM cannot be defended on primary sources."
        return real_detect(output, source)

    cons.detect_pivot_out = force_pivot  # type: ignore[assignment]

    try:
        result = await run_debate(
            session_id="smoke-test-session",
            idea="A test idea designed to trigger PIVOT_OUT in round 2.",
            providers=providers,
            session_config="",
        )
    finally:
        cons.detect_pivot_out = real_detect  # type: ignore[assignment]
        debate_runner.run_phase_a = real_run_phase_a  # type: ignore[assignment]

    print("=" * 60)
    print("verdict          :", result.get("verdict"))
    print("rounds count     :", len(result.get("rounds", [])))
    print("pivot_report len :", len((result.get("report") or {}).get("pivot_report", "") or ""))
    print("output len       :", len((result.get("report") or {}).get("output", "") or ""))
    print("summary len      :", len((result.get("report") or {}).get("summary", "") or ""))
    print("LLM stub calls   :", len(llm.calls))
    print("=" * 60)
    print()
    pr = (result.get("report") or {}).get("pivot_report") or ""
    print("--- pivot_report (first 400 chars) ---")
    print(pr[:400])
    print()
    print("--- saved by storage ---")
    print("verdict:", storage.saved_verdict)

    # Assertions — the whole point of the smoke test
    assert result.get("verdict") == "PIVOT_OUT", f"expected PIVOT_OUT, got {result.get('verdict')}"
    assert pr.strip(), "pivot_report should be populated"
    assert storage.saved_verdict == "PIVOT_OUT", "persistence path should also see PIVOT_OUT"
    print()
    print("[OK] smoke test passed — PIVOT_OUT verdict path works end-to-end")


if __name__ == "__main__":
    asyncio.run(main())
