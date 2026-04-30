"""
Mock test for Forge pipeline — tests full flow without real LLM calls.
Run: python -m engine.tests.test_forge_pipeline
"""

import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path

# Add engine to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from engine.core.providers import LLMResponse, Providers
from engine.core.ideation_runner import run_ideation, _parse_strategist_output, _validate_rice, _run_gated_round1


# ============================================================
# Mock Providers
# ============================================================

MOCK_STRATEGIST_JSON = json.dumps({
    "ideas": [
        {
            "rank": 1,
            "name": "DevPulse",
            "description": "Real-time developer sentiment tracker using commit messages and PR comments.",
            "problem": "Engineering managers lack visibility into team morale until it's too late.",
            "why_now": "LLMs can now parse sentiment from technical language accurately.",
            "target_market": "Engineering managers at 50-500 person companies",
            "moat": "Fine-tuned model on developer communication patterns",
            "revenue_model": "B2B SaaS $49/seat/month",
            "kill_score": 8,
            "rice_score": {"reach": 7, "impact": 8, "confidence": 6, "effort": 5, "total": 67},
            "key_metrics": ["Weekly active teams", "Sentiment accuracy", "Churn rate", "NPS"],
            "validation_plan": [
                {"assumption": "Managers want this data", "method": "Interview 10 eng managers", "success_criteria": "7/10 say they'd pay"}
            ],
            "kill_switch": ["<30% accuracy on sentiment → pivot to survey tool", "0 paying users after 8 weeks → abandon"],
            "lean_feasibility": "LEAN_FIT"
        },
        {
            "rank": 2,
            "name": "SpecForge",
            "description": "AI that turns Slack threads and meeting notes into product specs automatically.",
            "problem": "PMs spend 40% of time writing specs from scattered discussions.",
            "why_now": "Context window sizes now support full conversation threads.",
            "target_market": "Product managers at B2B SaaS companies",
            "moat": "Integration depth with Slack/Notion/Linear ecosystem",
            "revenue_model": "Team plan $99/month for up to 10 PMs",
            "kill_score": 7,
            "rice_score": {"reach": 8, "impact": 7, "confidence": 5, "effort": 6, "total": 47},
            "key_metrics": ["Specs generated/week", "Edit distance from final", "Time saved", "Retention"],
            "validation_plan": [
                {"assumption": "PMs find this valuable", "method": "Build Chrome extension MVP", "success_criteria": "50 installs in 2 weeks"}
            ],
            "kill_switch": ["Specs require >50% manual editing → pivot", "No repeat usage after trial → abandon"],
            "lean_feasibility": "LEAN_FIT"
        },
        {
            "rank": 3,
            "name": "CostLens",
            "description": "AI infrastructure cost anomaly detector with automated right-sizing recommendations.",
            "problem": "Cloud bills spike unexpectedly; teams overprovision out of fear.",
            "why_now": "AI workloads are creating unpredictable cost patterns that existing tools miss.",
            "target_market": "DevOps teams running AI/ML workloads on AWS/GCP",
            "moat": "ML model trained on cost patterns across 1000s of AI workloads",
            "revenue_model": "Percentage of savings (10% of identified savings)",
            "kill_score": 6,
            "rice_score": {"reach": 6, "impact": 8, "confidence": 5, "effort": 7, "total": 34},
            "key_metrics": ["Monthly savings identified", "Alert accuracy", "Time to detection", "Customer ROI"],
            "validation_plan": [
                {"assumption": "Teams will share cost data", "method": "Offer free audit to 5 companies", "success_criteria": "3/5 share data"}
            ],
            "kill_switch": ["Can't get cost data access → pivot to advisory", "Savings <$500/mo per customer → not worth it"],
            "lean_feasibility": "STRETCH"
        }
    ],
    "comparison": {
        "dimensions": ["Core advantage", "Biggest risk", "Lean feasibility", "Time to validate"],
        "idea_a": ["Unique sentiment data", "Accuracy concerns", "LEAN_FIT", "4 weeks"],
        "idea_b": ["Integration depth", "Output quality", "LEAN_FIT", "3 weeks"],
        "idea_c": ["Savings-based pricing", "Data access", "STRETCH", "6 weeks"]
    }
})


class MockLLM:
    """Mock LLM that returns canned responses."""

    call_count = 0

    async def call(self, prompt: str, model: str, system_prompt=None, max_tokens=4096, temperature=0.7):
        self.call_count += 1
        # Detect if this is the strategist call (lower temp, larger tokens)
        if temperature < 0.5 or max_tokens > 6000:
            return LLMResponse(
                content=MOCK_STRATEGIST_JSON,
                model=model,
                input_tokens=2000,
                output_tokens=1500,
                cost_usd=0.01,
            )
        # Proposer/Defender responses
        role = "Proposer" if "Pain" in prompt or "solution" in prompt.lower() or "Round" in prompt else "Defender"
        return LLMResponse(
            content=f"[Mock {role} Round {self.call_count}] Analysis of market gaps and pain points. "
                    f"Key insight: developers need better tooling for AI ops. "
                    f"Top pain point: infrastructure costs are unpredictable.",
            model=model,
            input_tokens=800,
            output_tokens=600,
            cost_usd=0.003,
        )

    async def call_with_search(self, prompt: str, model: str, system_prompt=None, max_tokens=4096):
        return await self.call(prompt, model, max_tokens=max_tokens)


class MockStorage:
    """Mock storage that tracks all writes."""

    def __init__(self):
        self.updates = []
        self.rounds_saved = []
        self.final_result = None

    async def update_status(self, table, session_id, status):
        self.updates.append({"type": "status", "table": table, "id": session_id, "status": status})

    async def update_progress(self, table, session_id, progress, message):
        self.updates.append({"type": "progress", "table": table, "progress": progress, "message": message})

    async def append_round(self, session_id, round_data):
        self.rounds_saved.append(round_data)

    async def save_forge_results(self, session_id, rounds, top_ideas, total_cost_usd=0, total_input_tokens=0, total_output_tokens=0, model=""):
        self.final_result = {
            "session_id": session_id,
            "rounds": rounds,
            "top_ideas": top_ideas,
            "total_cost_usd": total_cost_usd,
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "model": model,
        }


# ============================================================
# Tests
# ============================================================

async def test_full_pipeline():
    """Test the full 5-round ideation pipeline with mock providers."""
    print("\n=== Test: Full Pipeline ===")

    llm = MockLLM()
    storage = MockStorage()
    providers = Providers(llm=llm, storage=storage, model="mock-model")

    progress_log = []

    async def on_progress(step, message, pct):
        progress_log.append({"step": step, "message": message, "pct": pct})

    result = await run_ideation(
        session_id="test-session-123",
        context="Developer tools market. Key pain: AI infra costs are unpredictable.",
        providers=providers,
        on_progress=on_progress,
    )

    # Assertions
    assert result["session_id"] == "test-session-123"
    assert len(result["rounds"]) == 5, f"Expected 5 rounds, got {len(result['rounds'])}"
    assert len(result["top_ideas"]) == 3, f"Expected 3 ideas, got {len(result['top_ideas'])}"
    assert result["costs"]["total_usd"] > 0

    # Check structured output (screening may reorder, check all 3 exist)
    all_names = {idea["name"] for idea in result["top_ideas"]}
    assert "DevPulse" in all_names
    assert "SpecForge" in all_names
    assert "CostLens" in all_names
    assert len(result["top_ideas"]) == 3

    # Check LLM call count: R1=4 gated + 1 defender, R2-5=4*2, Strategist=1, Screening=2 => 16
    assert llm.call_count >= 16, f"Expected >= 16 LLM calls (gated R1 + screening), got {llm.call_count}"

    # Check storage calls
    assert len(storage.rounds_saved) == 5
    assert storage.final_result is not None
    assert storage.final_result["total_cost_usd"] > 0
    assert storage.final_result["model"] == "mock-model"

    # Check progress includes gated round 1 steps
    assert len(progress_log) > 0
    steps = [p["step"] for p in progress_log]
    assert "round1" in steps, "Expected gated round1 progress steps"
    assert "strategist" in steps
    assert "done" in steps

    # Check status updates
    status_updates = [u for u in storage.updates if u["type"] == "status"]
    assert status_updates[0]["status"] == "running"

    print(f"  OK 5 rounds + screening completed ({llm.call_count} LLM calls total)")
    print(f"  OK Round 1: 4-step gated pain discovery with validators")
    print(f"  OK Kill + RICE screening executed")
    print(f"  OK 3 structured ideas (DevPulse, SpecForge, CostLens)")
    print(f"  OK Cost tracked: ${result['costs']['total_usd']:.4f}")
    print(f"  OK {len(progress_log)} progress updates emitted")
    print(f"  OK Storage: {len(storage.rounds_saved)} rounds saved, final result written")


def test_parse_strategist_output():
    """Test JSON parsing with various inputs."""
    print("\n=== Test: Strategist JSON Parsing ===")

    # Valid JSON
    ideas = _parse_strategist_output(MOCK_STRATEGIST_JSON)
    assert len(ideas) == 3
    assert ideas[0]["name"] == "DevPulse"
    assert ideas[1]["rice_score"]["total"] == 47
    print("  OK Valid JSON parsed correctly")

    # JSON with code fences
    fenced = f"```json\n{MOCK_STRATEGIST_JSON}\n```"
    ideas = _parse_strategist_output(fenced)
    assert len(ideas) == 3
    print("  OK Code-fenced JSON parsed correctly")

    # Invalid JSON fallback
    ideas = _parse_strategist_output("This is not JSON at all, just text output.")
    assert len(ideas) == 1
    assert ideas[0]["name"] == "Brainstorm Results"
    assert ideas[0]["kill_score"] == 5
    print("  OK Invalid JSON falls back gracefully")

    # Edge: kill_score out of range
    edge_json = json.dumps({"ideas": [{"rank": 1, "name": "Test", "kill_score": 15, "rice_score": {"reach": 12, "impact": -1, "confidence": 5, "effort": 0}}]})
    ideas = _parse_strategist_output(edge_json)
    assert ideas[0]["kill_score"] == 10  # clamped
    assert ideas[0]["rice_score"]["reach"] == 10  # clamped
    assert ideas[0]["rice_score"]["impact"] == 1  # clamped min
    assert ideas[0]["rice_score"]["effort"] == 1  # clamped min (avoid div by zero)
    print("  OK Out-of-range scores clamped correctly")


def test_validate_rice():
    """Test RICE score validation."""
    print("\n=== Test: RICE Validation ===")

    # Normal case
    rice = _validate_rice({"reach": 8, "impact": 7, "confidence": 6, "effort": 5, "total": 67})
    assert rice == {"reach": 8, "impact": 7, "confidence": 6, "effort": 5, "total": 67}
    print("  OK Normal RICE preserved")

    # Calculate total if missing
    rice = _validate_rice({"reach": 8, "impact": 7, "confidence": 6, "effort": 5})
    assert rice["total"] == round((8 * 7 * 6) / 5)  # 67
    print("  OK Missing total calculated")

    # Empty dict
    rice = _validate_rice({})
    assert rice == {"reach": 5, "impact": 5, "confidence": 5, "effort": 5, "total": 25}
    print("  OK Empty dict gets defaults")


async def main():
    print("=" * 60)
    print("GapSmith Forge Pipeline - Mock Test Suite")
    print("=" * 60)

    test_parse_strategist_output()
    test_validate_rice()
    await test_full_pipeline()

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED OK")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
