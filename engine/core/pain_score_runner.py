"""
Pain Signal Scoring — adapted from Idea Generator pipeline for GapSmith web.
Scores pain posts and clusters them. Uses LLMProvider instead of claude subprocess.
"""

import asyncio
import json
import re
from datetime import datetime, timezone

from engine.core.providers import LLMProvider, LLMResponse

BATCH_SIZE = 10
POSTS_PER_BATCH = 20
CONFIDENCE_MAP = {"A": 1.0, "B": 0.85, "C": 0.6, "D": 0.3}

PAIN_RUBRIC = """## Pain Scoring Dimensions (all 1-10 scale, equally weighted)

| Dimension | 1-3 | 4-6 | 7-10 |
|-----------|-----|-----|------|
| pain_specificity | Vague complaint, no details | Some specifics but generic | Specific person + problem + context |
| pain_frequency | Isolated incident | Some agreement (5-20 upvotes) | Widespread (50+ upvotes, "me too" replies) |
| pain_workaround | No workaround mentioned | Mentions workaround exists | Describes specific bad workaround in use |
| pain_willingness | No mention of paying | Implied value ("I'd do anything") | Explicitly mentions paying/would pay |
| pain_recency | Old problem, likely resolved | Ongoing but not urgent | Active, recent, getting worse |
| pain_unresolved | Good solution exists | Partial solutions suggested | No good solution, thread ends frustrated |

pain_score = average of 6 dimensions
pain_level: painkiller (>=7.0) / vitamin (4.0-6.9) / phantom (<4.0)

## Metadata to Extract
- pain_theme: 1-sentence summary (English)
- user_segment: developer / retail_user / project_team / trader / institution
- sector: DeFi / Infra / Security / UX / Developer Tools / Wallet / Bridge / NFT / DAO / SaaS / AI-ML / Fintech / DevTools / Data / Productivity / E-commerce / Marketplace / EdTech / HealthTech / API / No-code / Other
- existing_workaround: what the user is currently doing (if mentioned)"""

PAIN_SYSTEM_PROMPT = f"""You are a user pain point evaluation expert. Score posts (from Reddit, GitHub Issues, HN) for pain intensity.

{PAIN_RUBRIC}

## Confidence Assessment
A) Very confident — detailed description, clear pain, specific details
B) Clear enough — can infer pain level from content
C) Slightly confident — short post or insufficient info
D) Not confident — too little info, mostly guessing

## Output

Output a strict JSON array:

```json
[
  {{
    "id": "post_id",
    "scores": {{
      "pain_specificity": 1-10,
      "pain_frequency": 1-10,
      "pain_workaround": 1-10,
      "pain_willingness": 1-10,
      "pain_recency": 1-10,
      "pain_unresolved": 1-10
    }},
    "pain_theme": "One sentence describing the pain (English)",
    "user_segment": "developer",
    "sector": "AI-ML",
    "existing_workaround": "what user currently does or null",
    "confidence_level": "A"
  }}
]
```

Output ONLY the JSON array, no other text."""


def _build_batch_prompt(posts: list[dict]) -> str:
    posts_text = ""
    for i, p in enumerate(posts, 1):
        content = re.sub(r'<[^>]+>', '', p.get('content', '') or p.get('summary', ''))
        content = ' '.join(content.split())[:1500]
        posts_text += f"""
### Post {i}
- **ID**: {p['id']}
- **Title**: {p['title']}
- **Source**: {p['source_name']} ({p.get('source_type', '?')})
- **Content**: {content}

"""
    return f"""Score the following {len(posts)} posts for pain intensity. Use dimensions and format from system prompt.

## Posts

{posts_text}

Output ONLY the JSON array."""


def _parse_json(raw: str) -> list:
    try:
        data = json.loads(raw)
        if isinstance(data, list): return data
    except json.JSONDecodeError: pass

    match = re.search(r'```json\s*(\[.*?\])\s*```', raw, re.DOTALL)
    if match:
        try: return json.loads(match.group(1))
        except json.JSONDecodeError: pass

    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if match:
        try: return json.loads(match.group(0))
        except json.JSONDecodeError: pass
    return []


def _find_cluster(theme: str, sector: str, clusters: list[dict]) -> str | None:
    theme_words = set(theme.lower().split())
    for c in clusters:
        c_theme = c.get('theme', '').lower()
        c_words = set(c_theme.split())
        cid = c.get('id', '')
        if len(theme_words & c_words) >= 3:
            return cid
        if any(w in c_theme for w in theme_words if len(w) > 5):
            if sector == c.get('sector', ''):
                return cid
    return None


async def run_pain_scoring(
    posts: list[dict],
    llm: LLMProvider,
    model: str = "gpt-5.4",
    existing_clusters: list[dict] | None = None,
    on_progress: callable = None,
) -> dict:
    """
    Score pain posts and assign to clusters.

    Args:
        posts: List of pain post dicts from pain_fetcher.
        llm: LLMProvider instance.
        model: Model for scoring.
        existing_clusters: Previous clusters for matching (optional).
        on_progress: Optional callback(step, message).

    Returns:
        dict with keys: scored_posts (list), clusters (list), stats (dict), costs (dict)
    """
    async def progress(step, msg):
        if on_progress:
            result = on_progress(step, msg)
            if asyncio.isfuture(result) or asyncio.iscoroutine(result):
                await result

    if not posts:
        return {'scored_posts': [], 'clusters': existing_clusters or [], 'stats': {}, 'costs': {'total_usd': 0, 'input_tokens': 0, 'output_tokens': 0}}

    clusters = list(existing_clusters or [])
    total_cost = 0.0
    total_in = 0
    total_out = 0

    batches = [posts[i:i+POSTS_PER_BATCH] for i in range(0, len(posts), POSTS_PER_BATCH)]
    await progress("scoring", f"Scoring {len(posts)} pain posts in {len(batches)} batches...")

    all_scored = {}

    for wave_start in range(0, len(batches), BATCH_SIZE):
        wave = batches[wave_start:wave_start + BATCH_SIZE]
        tasks = [
            llm.call(
                prompt=_build_batch_prompt(batch),
                model=model,
                system_prompt=PAIN_SYSTEM_PROMPT,
                max_tokens=4096,
            )
            for batch in wave
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for batch, result in zip(wave, results):
            if isinstance(result, Exception):
                await progress("warning", f"Batch failed: {result}")
                try:
                    result = await llm.call(
                        prompt=_build_batch_prompt(batch), model=model,
                        system_prompt=PAIN_SYSTEM_PROMPT, max_tokens=4096,
                    )
                except Exception:
                    continue

            if isinstance(result, LLMResponse):
                total_cost += result.cost_usd
                total_in += result.input_tokens
                total_out += result.output_tokens
                parsed = _parse_json(result.content)
            else:
                continue

            for scored in parsed:
                pid = scored.get('id', '')
                if pid:
                    all_scored[pid] = scored

        done = min(wave_start + BATCH_SIZE, len(batches))
        await progress("scoring", f"Batches {wave_start+1}-{done}/{len(batches)} done ({len(all_scored)} scored)")

    # Merge + cluster
    next_cluster_id = max((int(re.sub(r'[^0-9]', '', c.get('id', '0')) or 0) for c in clusters), default=0) + 1
    scored_posts = []
    stats = {'painkiller': 0, 'vitamin': 0, 'phantom': 0}
    clusters_created = 0

    for post in posts:
        pid = post['id']

        if pid in all_scored:
            s = all_scored[pid]
            scores = s.get('scores', {})
            pain_score = round(sum(scores.values()) / max(len(scores), 1), 2)
            conf_level = s.get('confidence_level', 'B')
        else:
            scores = {k: 1 for k in ['pain_specificity', 'pain_frequency', 'pain_workaround',
                                      'pain_willingness', 'pain_recency', 'pain_unresolved']}
            pain_score = 1.0
            conf_level = 'D'
            s = {}

        if pain_score >= 7.0: pain_level = 'painkiller'
        elif pain_score >= 4.0: pain_level = 'vitamin'
        else: pain_level = 'phantom'
        stats[pain_level] += 1

        # Pain theme — keep the full LLM-written theme. Falls back to the
        # post title (capped at 200 to avoid extremely long Reddit titles).
        pain_theme = s.get('pain_theme') or post['title'][:200]
        sector = s.get('sector', 'Other')

        cluster_id = None
        if pain_level != 'phantom':
            cluster_id = _find_cluster(pain_theme, sector, clusters)
            if cluster_id:
                for c in clusters:
                    if c.get('id') == cluster_id:
                        c['mention_count'] = c.get('mention_count', 0) + 1
                        n = c['mention_count']
                        c['avg_score'] = round((c.get('avg_score', 5) * (n-1) + pain_score) / n, 2)
                        break
            else:
                cluster_id = f"pc-{next_cluster_id:03d}"
                next_cluster_id += 1
                # Cap at 240 chars instead of 100 — long enough to fit a
                # full sentence while keeping the report card scannable.
                clusters.append({
                    'id': cluster_id, 'theme': pain_theme[:240], 'sector': sector,
                    'mention_count': 1, 'avg_score': pain_score, 'trend': 'new',
                })
                clusters_created += 1

        scored_posts.append({
            'id': pid, 'title': post['title'], 'link': post.get('link', ''),
            'source_name': post['source_name'], 'source_type': post.get('source_type', ''),
            'scores': scores, 'pain_score': pain_score, 'pain_level': pain_level,
            'pain_theme': pain_theme,
            'user_segment': s.get('user_segment', 'developer'),
            'sector': sector,
            'existing_workaround': s.get('existing_workaround'),
            'cluster_id': cluster_id,
            'confidence': CONFIDENCE_MAP.get(conf_level, 0.85),
            'confidence_level': conf_level,
        })

    scored_posts.sort(key=lambda p: p['pain_score'], reverse=True)

    await progress("done", f"Scored {len(scored_posts)} posts, {clusters_created} new clusters (cost: ${total_cost:.2f})")

    return {
        'scored_posts': scored_posts,
        'clusters': clusters,
        'stats': stats,
        'costs': {'total_usd': round(total_cost, 4), 'input_tokens': total_in, 'output_tokens': total_out},
    }
