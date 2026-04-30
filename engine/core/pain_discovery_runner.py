"""
Pain Discovery Runner — LLM-driven pain point discovery + web search validation.

Mirrors CLI's pain_discovery.py but uses LLMProvider + SearchProvider
instead of claude subprocess. Discovers pain points the passive
RSS/Reddit/GitHub fetchers might miss.

Steps:
  1. LLM generates top pain points per sector
  2. Web search validates each (real complaints? existing solutions?)
  3. Returns validated pain posts merged into the scoring pipeline
"""

import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone

from engine.core.providers import LLMProvider, SearchProvider, LLMResponse


# Sector display names for prompts (keyed by frontend sector ID)
SECTOR_NAMES = {
    "ai-ml": "AI Agents & LLM Tooling",
    "saas": "SaaS & Developer Tools",
    "fintech": "Fintech & Payments",
    "cybersecurity": "Security & Compliance",
    "ecommerce": "E-commerce & Marketplace",
    "edtech": "EdTech & Online Learning",
    "healthtech": "HealthTech & Wellness",
    "creator": "Creator Economy & Media",
    "logistics": "Supply Chain & Logistics",
    "proptech": "Real Estate & PropTech",
    "climate": "Climate & Energy",
    "devtools": "DevOps & Infrastructure",
}


def _generate_id(sector: str, title: str) -> str:
    content = f"llm_discovery:{sector}:{title}"
    return hashlib.md5(content.encode()).hexdigest()[:12]


def _build_discovery_prompt(sector_name: str) -> str:
    return f"""You are a pain point discovery expert. Identify the top **10** unsolved pain points in **{sector_name}**.

## Rules

1. Each pain point must be specific and verifiable — not vague
2. Describe the core problem in one sentence
3. Tag target user: developer / founder / team_lead / retail_user / enterprise
4. Tag severity: high / medium / low
5. Suggest 2 search queries to validate (one for complaints, one for solutions)

## Output (strict JSON array)

```json
[
  {{
    "title": "One sentence pain description",
    "sector": "{sector_name}",
    "target_user": "developer",
    "severity": "high",
    "search_queries": {{
      "complaints": "keyword frustrated OR problem site:reddit.com",
      "solutions": "keyword tool OR solution OR SaaS"
    }}
  }}
]
```

Output ONLY the JSON array, no other text."""


def _parse_json_array(raw: str) -> list[dict]:
    """Extract JSON array from LLM output."""
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass

    match = re.search(r'```json\s*(\[.*?\])\s*```', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return []


async def _validate_pain_point(
    pain: dict, search: SearchProvider
) -> dict:
    """Validate a single pain point with web search."""
    queries = pain.get("search_queries", {})
    validation = {
        "has_complaints": False,
        "complaint_evidence": "",
        "has_solution": False,
        "solution_note": "",
    }

    # Search for complaints
    complaint_query = queries.get("complaints", f"{pain['title']} frustrated OR problem")
    try:
        results = await search.search(complaint_query, num_results=3)
        if results:
            validation["has_complaints"] = True
            evidence = [f"{r.title}: {r.snippet[:100]}" for r in results[:2]]
            validation["complaint_evidence"] = " | ".join(evidence)
    except Exception:
        pass

    # Search for existing solutions
    solution_query = queries.get("solutions", f"{pain['title']} tool OR solution")
    try:
        results = await search.search(solution_query, num_results=3)
        if results:
            # Check if results look like actual solutions
            solution_titles = " ".join(r.title.lower() for r in results)
            has_product = any(w in solution_titles for w in ["pricing", "free trial", "sign up", "platform", "app"])
            validation["has_solution"] = has_product
            validation["solution_note"] = results[0].title if results else ""
    except Exception:
        pass

    pain["validation"] = validation
    return pain


def _to_pain_posts(pain_points: list[dict]) -> list[dict]:
    """Convert validated pain points to PainPost-compatible dicts."""
    posts = []
    now = datetime.now(timezone.utc).isoformat()

    for p in pain_points:
        validation = p.get("validation", {})
        if not validation.get("has_complaints", False):
            continue
        if validation.get("has_solution", True):
            continue

        title = p.get("title", "")
        sector = p.get("sector", "Other")

        posts.append({
            "id": _generate_id(sector, title),
            "source_name": f"AI Discovery ({sector})",
            "source_url": "llm_discovery",
            "source_type": "llm_discovery",
            "title": title,
            "link": "",
            "published": now,
            "updated": now,
            "summary": title,
            "content": json.dumps({
                "target_user": p.get("target_user", "developer"),
                "severity": p.get("severity", "medium"),
                "validation": validation,
            }, ensure_ascii=False),
            "author": "AI Discovery",
            "tags": [sector],
            "lang": "en",
            "fetched_at": now,
            "pain_keywords_matched": ["llm_discovery"],
            "noise_keywords_matched": [],
            "passed_filter": True,
        })

    return posts


async def run_pain_discovery(
    sectors: list[str],
    llm: LLMProvider,
    search: SearchProvider | None,
    model: str = "gpt-5.4",
    on_progress: callable = None,
) -> dict:
    """
    Discover and validate pain points via LLM + web search.

    Args:
        sectors: Frontend sector IDs (e.g. ["ai-ml", "saas"])
        llm: LLM provider for discovery
        search: Search provider for validation (Tavily). If None, skips validation.
        model: Model name
        on_progress: Optional async callback(step, message)

    Returns:
        dict with keys: posts (list), stats (dict), costs (dict)
    """
    async def progress(step, msg):
        if on_progress:
            result = on_progress(step, msg)
            if asyncio.isfuture(result) or asyncio.iscoroutine(result):
                await result

    total_cost = 0.0
    total_in = 0
    total_out = 0
    all_discovered = []

    # Step 1: LLM discovery per sector
    for sector_id in sectors:
        sector_name = SECTOR_NAMES.get(sector_id, sector_id)
        await progress("discovery", f"Discovering pain points in {sector_name}...")

        try:
            result = await llm.call(
                prompt=_build_discovery_prompt(sector_name),
                model=model,
                max_tokens=4096,
                temperature=0.8,
            )
            total_cost += result.cost_usd
            total_in += result.input_tokens
            total_out += result.output_tokens

            pain_points = _parse_json_array(result.content)
            await progress("discovery", f"Found {len(pain_points)} pain points in {sector_name}")
            all_discovered.extend(pain_points)
        except Exception as e:
            await progress("warning", f"Discovery failed for {sector_name}: {e}")

    # Step 2: Web search validation (if search provider available)
    validated = []
    if search and all_discovered:
        await progress("validation", f"Validating {len(all_discovered)} pain points with web search...")

        # Validate in batches of 5 to avoid rate limits
        for i in range(0, len(all_discovered), 5):
            batch = all_discovered[i:i + 5]
            results = await asyncio.gather(
                *[_validate_pain_point(p, search) for p in batch],
                return_exceptions=True,
            )
            for r in results:
                if isinstance(r, dict):
                    validated.append(r)

            done = min(i + 5, len(all_discovered))
            confirmed = sum(1 for v in validated
                           if v.get("validation", {}).get("has_complaints") and
                           not v.get("validation", {}).get("has_solution"))
            await progress("validation", f"Validated {done}/{len(all_discovered)} ({confirmed} confirmed)")
    else:
        validated = all_discovered

    # Convert to PainPost format
    posts = _to_pain_posts(validated)

    stats = {
        "sectors_probed": len(sectors),
        "total_discovered": len(all_discovered),
        "total_validated": len(validated),
        "confirmed_pains": len(posts),
    }

    await progress("done", f"Discovered {len(posts)} validated pain points")

    return {
        "posts": posts,
        "stats": stats,
        "costs": {
            "total_usd": round(total_cost, 4),
            "input_tokens": total_in,
            "output_tokens": total_out,
        },
    }
