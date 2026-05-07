"""
One-shot real-LLM smoke: does MiniMax-M2.7 actually emit the new YAML
verdict block when prompted? Costs ~$0.05-0.10. NOT part of CI.

Run:  python -m engine.tests.smoke_minimax_yaml_compliance
"""

import asyncio
import os
import sys
from pathlib import Path

# Load .env.local
ENV_FILE = Path(__file__).resolve().parents[2] / ".env.local"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("AGENT_LLM_KEY")
if not API_KEY:
    print("ERROR: AGENT_LLM_KEY missing from .env.local")
    sys.exit(1)

from engine.adapters.litellm_provider import LiteLLMProvider
from engine.core.validators import parse_verdict_block, make_verdict_validator


# Mirror the production Defender Step 2 prompt structure, with stub upstream content.
def build_prompt(scenario: str) -> str:
    if scenario == "ADJUSTED":
        challenges = """Challenger:
- Concern: TAM unclear. Estimated $200M-$2B range with no primary sources.
- Concern: Pricing $49/mo seems low vs Linear's $8/seat for similar feature set.

Analyst:
- Cost structure assumes $0.50/user/mo on Supabase but volume-discount tier kicks in at 10k users.
- Year-1 revenue projection of $180K assumes 5% conversion — industry benchmark is 1-2%."""
        evidence = """- Linear pricing: https://linear.app/pricing — confirmed $8/seat starter, $14/seat business
- Supabase tier docs: https://supabase.com/pricing — Pro $25/mo, scales linearly
- TAM source: Statista B2B SaaS task management 2026 — $4.2B (URL: https://statista.com/example)"""
        instruction = "The challenges have evidence-backed concerns but they are addressable with adjustments to pricing and conversion assumptions. The core wedge (async-first project tracking) is intact."
    else:  # PIVOT_OUT
        challenges = """Challenger:
- Fatal: Three direct competitors with $50M+ funding and same exact feature set.
- Fatal: Target users (devops engineers) explicitly say in surveys they prefer existing tools.

Analyst:
- Year-1 revenue would need $300K to break even but pessimistic case is $40K.
- All cost assumptions confirmed; the issue is demand, not unit economics."""
        evidence = """- Competitor 1: https://example.com/comp-a (raised $80M series B 2025)
- Competitor 2: https://example.com/comp-b (raised $60M, 12k paying customers)
- DevOps survey: https://example.com/survey — 78% satisfaction with incumbent, no churn intent"""
        instruction = "Three well-funded direct competitors with proven traction and a target market that doesn't want a new solution. Evidence search yielded no counter — there is no defensible adjustment."

    return f"""Round 2 / Phase C / Step 2: Unified Defense

Based on your evidence search, respond formally to all challenges.

Evidence search results:
{evidence}

All challenges:
{challenges}

Proposer original plan:
A new async-first project tracking SaaS for distributed dev teams. $49/mo flat. Targets 30 customers in year 1.

Requirements:
- Respond to every [FAIL] critical and [WARN] medium challenge
- Pay special attention to Challenger's Must-Answer Checklist
- Response type: [OK] AGREE / [FAIL] REFUTE / 🔄 EXTEND / [WARN] PARTIAL
- AGREE → adjustment. REFUTE → cite search evidence. No evidence → mark `[unverified]`.
- If major adjustment, provide the updated idea version.

**Critical**: Every REFUTE response MUST cite inline search evidence (`[REF: SEARCH] URL`
from your Step 1 evidence search or the Evidence Hunter report above). Unverified claims
must be labeled `[unverified]`. Dropping citations is not acceptable.

Your honest assessment of this scenario: {instruction}

Return as markdown.

---

## [WARN] MANDATORY: append a verdict YAML block at the **end** of your reply (machine-parsed)

```yaml
status: ADJUSTED  # must be one of: STRENGTHENED | ADJUSTED | VULNERABLE | PIVOT_OUT
reason_brief: "<one-line reason, <200 chars>"
```

The four options:
- **STRENGTHENED**: evidence search backed your position; no major concessions.
- **ADJUSTED** (default, most common): you partially conceded and adjusted the plan, but the wedge holds.
- **VULNERABLE**: serious unresolved challenges remain — but you do NOT abandon the direction; defer to next round / external validation.
- **PIVOT_OUT**: you honestly judge that the original direction **cannot** be defended, and the entire idea should be abandoned.
  - **This is the nuclear option — it terminates the debate.**
  - **Only use when you genuinely cannot find any adjustment path.**
  - "Has open challenges" / "needs adjustment" / "evidence is partly against me but I have a counter" are **NOT** PIVOT_OUT — those are ADJUSTED or VULNERABLE."""


async def run_scenario(llm: LiteLLMProvider, scenario: str) -> tuple[bool, str, dict | None]:
    prompt = build_prompt(scenario)
    print(f"\n{'='*70}\nScenario: {scenario}\n{'='*70}")
    resp = await llm.call(
        prompt=prompt,
        model="MiniMax-M2.7",
        system_prompt="You are the Defender in a multi-agent debate. Respond honestly and follow output format strictly.",
        max_tokens=4096,
    )
    content = resp.content
    print(f"Output length: {len(content)} chars | Cost: ${resp.cost_usd:.4f}")

    # Parse verdict block
    parsed = parse_verdict_block(content, "defender")
    validator = make_verdict_validator("defender")
    valid, feedback = validator(content)

    print(f"\n--- Last 500 chars of output ---\n{content[-500:]}\n")

    if parsed is None:
        print(f"[FAIL] NO YAML BLOCK FOUND")
    else:
        print(f"[OK] YAML BLOCK PARSED: status={parsed.get('status')!r}, reason_brief={parsed.get('reason_brief', '')[:100]!r}")

    if valid:
        print(f"[OK] VALIDATOR PASSED")
    else:
        print(f"[FAIL] VALIDATOR FAILED: {feedback[:200]}")

    return valid, content, parsed


async def main():
    llm = LiteLLMProvider(api_key=API_KEY, provider="minimax", default_model="MiniMax-M2.7")

    # Scenario 1: should ADJUSTED
    valid_a, _, parsed_a = await run_scenario(llm, "ADJUSTED")
    expected_a_status = parsed_a and parsed_a.get("status") == "ADJUSTED"

    # Scenario 2: should PIVOT_OUT
    valid_b, _, parsed_b = await run_scenario(llm, "PIVOT_OUT")
    expected_b_status = parsed_b and parsed_b.get("status") == "PIVOT_OUT"

    print(f"\n{'='*70}\nSUMMARY\n{'='*70}")
    print(f"Scenario A (ADJUSTED): YAML block valid={valid_a}, correct status={expected_a_status}")
    print(f"Scenario B (PIVOT_OUT): YAML block valid={valid_b}, correct status={expected_b_status}")

    all_ok = valid_a and valid_b
    if all_ok:
        print("\n[OK] MiniMax follows YAML schema. Safe to deploy.")
        if expected_a_status and expected_b_status:
            print("[OK] Status values also match scenario semantics — gate logic + LLM judgment both healthy.")
        else:
            print("[WARN] Schema followed but status values may not match scenario hint — LLM judgment is its own thing; gate still works.")
    else:
        print("\n[FAIL] MiniMax did NOT reliably emit YAML block. Need to harden prompt before deploy.")
        sys.exit(2)


if __name__ == "__main__":
    asyncio.run(main())
