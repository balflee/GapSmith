"""
Real-LLM smoke for llm_generate_queries — verifies that against the
actual prompt that produced the user's failed Prove debate (APAC L&D
simulation v0.4 / Singapore banking compliance), the LLM returns
SPECIFIC, NAMED, EVIDENCE-RICH queries instead of the templated blog
spam ("X SaaS pricing plans") that triggered the bug.

Cost: ~$0.003 per scenario × 2 scenarios. Run before pushing changes
that touch llm_generate_queries.

Run:  python -m engine.tests.smoke_query_gen
"""

import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

# Force UTF-8 stdout on Windows so Chinese / non-ASCII chars in queries
# don't crash print() under cp1252.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

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
from engine.core.debate_helpers import (
    llm_generate_queries,
    extract_search_queries,
)


PROMPT_SG_BANKING = """Round 1 / Phase B / Step 1: Competitor Search

Search for direct competitors of the Proposer's plan.

--- IDEA / INPUT ---
# APAC L&D Simulation 平台 — 概念文档 v0.4

> 状态：草稿，用于持续讨论。v0.4 vs v0.3 的关键升级：(1) 核心 thesis 从"facilitator-first UX"升级到"强制使用率 = 反脆弱商业模型"。

为亚太培训公司老板提供 facilitator-first business simulation 工具——用"强制人类 facilitator 在场"作为反脆弱机制。

主要竞争对手：Celemi, BTS Group (Stockholm: BTS-B), Capsim, Mursion (had layoffs 2023), Talespin (pivoted to authoring), Cornerstone OnDemand (LMS, low usage rates), Docebo AI Virtual Coaching (2025).

Beachhead: Singapore regional banks (DBS, Maybank, OCBC) under MAS Individual Accountability framework.
--- END INPUT ---

Strategy:
- Search for each named competitor
- Find their pricing pages
- Find post-mortems / failure analyses
- Identify regulator references
"""

PROMPT_FORGE_PAIN = """Round 1 / Step 1: Pain Point Discovery

Search for real user complaints in this market.

CONTEXT:
## Market / Industry
Freelance creative work (design, copywriting, video editing)

## Target Audience
Solo freelancers earning $30K-100K/year

## Pain Points
- Client revisions creep beyond scope
- Late payment chases
- Hard to qualify good clients vs scope-creep clients

Find specific Reddit threads, Twitter complaints, discussions about these pains.
"""


async def run(label: str, prompt: str):
    print(f"\n{'='*70}\nScenario: {label}\n{'='*70}")
    llm = LiteLLMProvider(api_key=API_KEY, provider="minimax", default_model="MiniMax-M2.7")
    providers = SimpleNamespace(llm=llm, model="MiniMax-M2.7")

    print("\n--- Template (current fallback) ---")
    template_queries = extract_search_queries(prompt, max_queries=3)
    for q in template_queries:
        print(f"  -{q}")

    print("\n--- LLM-generated (new path) ---")
    llm_queries = await llm_generate_queries(providers, prompt, max_queries=3)
    if not llm_queries:
        print("  [FAIL] LLM returned no queries — would fall back to template")
        return False
    for q in llm_queries:
        print(f"  -{q}")

    # Heuristic quality check: LLM queries should mention SOME named entity from
    # the prompt (Celemi, BTS, MAS, etc. for SG banking; Reddit/Twitter for Forge)
    if label.startswith("SG"):
        named = ("celemi", "bts", "mursion", "talespin", "capsim", "cornerstone", "docebo", "mas", "dbs", "maybank", "ocbc")
    else:
        named = ("reddit", "twitter", "freelance", "client", "scope", "revision")
    matched = [q for q in llm_queries if any(n in q.lower() for n in named)]
    print(f"\n  Quality check: {len(matched)}/{len(llm_queries)} queries cite a named entity from the prompt")
    return len(matched) >= 1


async def main():
    ok1 = await run("SG banking compliance (the failure case)", PROMPT_SG_BANKING)
    ok2 = await run("Forge freelance pain discovery", PROMPT_FORGE_PAIN)

    print(f"\n{'='*70}\nSUMMARY\n{'='*70}")
    print(f"SG banking scenario: {'[OK]' if ok1 else '[WEAK]'} — at least one named-entity query")
    print(f"Forge freelance:     {'[OK]' if ok2 else '[WEAK]'} — at least one named-entity query")

    if ok1 and ok2:
        print("\n[OK] LLM query generation produces specific, named queries on real prompts")
        return 0
    print("\n[WEAK] LLM queries didn't reliably cite named entities — review prompt design")
    return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
