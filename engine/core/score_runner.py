"""
RSS Article Scoring — adapted from Idea Generator pipeline for GapSmith web.
Sonnet-tier batch scoring + optional higher-tier re-rank.
Uses LLMProvider instead of claude subprocess.
"""

import asyncio
import json
import re
from datetime import datetime, timezone

from engine.core.providers import LLMProvider, LLMResponse

BATCH_SIZE = 10
ARTICLES_PER_BATCH = 10
CONFIDENCE_MAP = {"A": 1.0, "B": 0.85, "C": 0.6, "D": 0.3}

SCORING_RUBRIC = """## Scoring Dimensions (all 1-10 scale)

### Content Quality (Weight: 15%)
| Dimension | 1-3 | 4-6 | 7-10 |
|-----------|-----|-----|------|
| source_authority | Anonymous/unknown | Community KOL / mid-tier media | Tier 1 thinkers / top VC |
| argument_depth | Pure opinion, no support | Has logic but no data | Has math/code/complete reasoning |
| data_support | No data | Estimates or secondary data | First-hand on-chain data/research |
| originality | Repost/summary | New angle on known idea | First-to-propose framework |
| verifiability | Cannot verify | Logic is traceable | Has specific source links |

### Opportunity Signal (Weight: 35%) — MOST IMPORTANT
| Dimension | 1-3 | 4-6 | 7-10 |
|-----------|-----|-----|------|
| pain_clarity | No specific problem | Has problem but vague users | Specific user group + quantifiable pain |
| pain_intensity | No feeling / nice-to-have | Complaining but tolerating | Already paying money/time to solve |
| enabler_signal | No new tech mentioned | Mentions existing tech | Mentions new protocol/tech breakthrough |
| why_now | No timing signal | Generic trend | Specific inflection point |
| gap_signal | Red ocean / giants entered | Differentiable | Clear gap or bad existing solutions |
| irreversible | Short-term hype | Cyclical hot topic | Structural change / irreversible |

### Market Signal (Weight: 25%)
| Dimension | 1-3 | 4-6 | 7-10 |
|-----------|-----|-----|------|
| market_size | No mention | Qualitative (big/small) | Specific TAM/user count/volume |
| payment_signal | Free mentality | Expressed willingness | Already paying / has revenue data |
| growth_signal | None / declining | Stable | Has growth data / adoption curve |
| capital_heat | No one mentions | Discussed but no funding | Recent funding / VC posts |

### Narrative Fit (Weight: 25%)
| Dimension | 1-3 | 4-6 | 7-10 |
|-----------|-----|-----|------|
| narrative_match | No mainstream narrative | Fits but not hot | Fits current hot narrative |
| narrative_stage | Declining / outdated | Mature | Early / growth stage |
| meme_potential | Very complex to explain | Needs background | One sentence pitch |
| vision_height | Small tool | Niche product | Industry-changing vision |
| contrarian | Following crowd | Differentiated angle | Unique insight / counter-intuitive |

## Sectors to Tag
Web3: DeFi, Infra, Consumer, AI x Crypto, Gaming, Social, DAO Tooling, Security, Developer Tools
Web2: SaaS, AI/ML, Fintech, DevTools, Data/Analytics, Marketplace, Productivity, EdTech, HealthTech, E-commerce"""

SCORING_SYSTEM_PROMPT = f"""You are a startup opportunity assessment expert. Score RSS articles to identify high-potential startup opportunities.

{SCORING_RUBRIC}

## Confidence Assessment

For each article, rate your confidence:
A) Very confident — clear info, sufficient data, clear signals
B) Clear enough — can infer some info from context
C) Slightly confident — short article or insufficient info
D) Not confident — minimal info, mostly guessing

## Output

Output a strict JSON array, one object per article:

```json
[
  {{
    "id": "article_id",
    "scores": {{
      "content_quality": {{ "source_authority": 1-10, "argument_depth": 1-10, "data_support": 1-10, "originality": 1-10, "verifiability": 1-10 }},
      "opportunity_signal": {{ "pain_clarity": 1-10, "pain_intensity": 1-10, "enabler_signal": 1-10, "why_now": 1-10, "gap_signal": 1-10, "irreversible": 1-10 }},
      "market_signal": {{ "market_size": 1-10, "payment_signal": 1-10, "growth_signal": 1-10, "capital_heat": 1-10 }},
      "narrative_fit": {{ "narrative_match": 1-10, "narrative_stage": 1-10, "meme_potential": 1-10, "vision_height": 1-10, "contrarian": 1-10 }}
    }},
    "sectors": ["DeFi", "Infra"],
    "narratives": ["AI x Crypto"],
    "confidence_level": "A"
  }}
]
```

Output ONLY the JSON array, no other text."""


def _build_batch_prompt(articles: list[dict]) -> str:
    articles_text = ""
    for i, a in enumerate(articles, 1):
        content = re.sub(r'<[^>]+>', '', a.get('content', '') or a.get('summary', ''))
        content = ' '.join(content.split())[:2000]
        articles_text += f"""
### Article {i}
- **ID**: {a['id']}
- **Title**: {a['title']}
- **Source**: {a['source_name']}
- **Published**: {a.get('published', 'unknown')}
- **Content**: {content}

"""
    return f"""Score the following {len(articles)} articles. Use the dimensions and format from the system prompt.

## Articles

{articles_text}

Output ONLY the JSON array."""


def _build_rerank_prompt(articles: list[dict]) -> str:
    articles_text = ""
    for a in articles:
        content = re.sub(r'<[^>]+>', '', a.get('content', '') or a.get('summary', ''))
        content = ' '.join(content.split())[:3000]
        articles_text += f"""
### {a['id']}: {a['title']}
Source: {a['source_name']}
Previous idea_potential: {a.get('idea_potential', '?')}
Previous confidence: {a.get('confidence_level', '?')}
Previous scores: {json.dumps(a.get('scores', {}), ensure_ascii=False)}
Content: {content}

"""
    return f"""You are a senior startup opportunity evaluator. The following articles were initially scored. Please re-evaluate.

Focus on:
1. Opportunity Signal (35% weight) — was a real big opportunity underestimated?
2. Low confidence articles — make the final judgment
3. Re-score all 20 dimensions independently, do not anchor on previous scores

{SCORING_RUBRIC}

## Articles to Review

{articles_text}

## Output

Output a strict JSON array (same format), only include articles whose scores you want to adjust.
If an article's scores are reasonable, do not include it.

Output ONLY the JSON array."""


def _parse_json(raw: str) -> list:
    try:
        data = json.loads(raw)
        if isinstance(data, list): return data
    except json.JSONDecodeError:
        pass

    match = re.search(r'```json\s*(\[.*?\])\s*```', raw, re.DOTALL)
    if match:
        try: return json.loads(match.group(1))
        except json.JSONDecodeError: pass

    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if match:
        try: return json.loads(match.group(0))
        except json.JSONDecodeError: pass

    return []


def _compute_idea_potential(scores: dict) -> float:
    cq = scores.get('content_quality', {})
    os_ = scores.get('opportunity_signal', {})
    ms = scores.get('market_signal', {})
    nf = scores.get('narrative_fit', {})

    cq_avg = sum(cq.values()) / max(len(cq), 1)
    os_avg = sum(os_.values()) / max(len(os_), 1)
    ms_avg = sum(ms.values()) / max(len(ms), 1)
    nf_avg = sum(nf.values()) / max(len(nf), 1)

    return round(cq_avg * 0.15 + os_avg * 0.35 + ms_avg * 0.25 + nf_avg * 0.25, 2)


async def run_scoring(
    articles: list[dict],
    llm: LLMProvider,
    model: str = "gpt-5.4",
    skip_rerank: bool = False,
    rerank_model: str | None = None,
    on_progress: callable = None,
) -> dict:
    """
    Score articles using LLM.

    Args:
        articles: List of article dicts from rss_fetcher.
        llm: LLMProvider instance (user's API key).
        model: Model for batch scoring.
        skip_rerank: Skip the re-rank pass.
        rerank_model: Model for re-rank (defaults to same model).
        on_progress: Optional callback(step, message).

    Returns:
        dict with keys: scored_articles (list), stats (dict), costs (dict)
    """
    async def progress(step, msg):
        if on_progress:
            result = on_progress(step, msg)
            if asyncio.isfuture(result) or asyncio.iscoroutine(result):
                await result

    if not articles:
        return {'scored_articles': [], 'stats': {}, 'costs': {'total_usd': 0, 'input_tokens': 0, 'output_tokens': 0}}

    total_cost = 0.0
    total_in = 0
    total_out = 0
    batches = [articles[i:i+ARTICLES_PER_BATCH] for i in range(0, len(articles), ARTICLES_PER_BATCH)]
    await progress("scoring", f"Scoring {len(articles)} articles in {len(batches)} batches...")

    all_scored = {}

    for wave_start in range(0, len(batches), BATCH_SIZE):
        wave = batches[wave_start:wave_start + BATCH_SIZE]
        tasks = [
            llm.call(
                prompt=_build_batch_prompt(batch),
                model=model,
                system_prompt=SCORING_SYSTEM_PROMPT,
                max_tokens=4096,
            )
            for batch in wave
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for batch, result in zip(wave, results):
            if isinstance(result, Exception):
                await progress("warning", f"Batch failed: {result}")
                # Retry once
                try:
                    result = await llm.call(
                        prompt=_build_batch_prompt(batch),
                        model=model,
                        system_prompt=SCORING_SYSTEM_PROMPT,
                        max_tokens=4096,
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
                aid = scored.get('id', '')
                if aid:
                    all_scored[aid] = scored

        done = min(wave_start + BATCH_SIZE, len(batches))
        await progress("scoring", f"Batches {wave_start+1}-{done}/{len(batches)} done ({len(all_scored)} scored)")

    # Merge scores
    scored_articles = []
    for a in articles:
        aid = a['id']
        if aid in all_scored:
            s = all_scored[aid]
            scores = s.get('scores', {})
            conf_level = s.get('confidence_level', 'B')

            a['scores'] = {
                'content_quality': scores.get('content_quality', {}),
                'opportunity_signal': scores.get('opportunity_signal', {}),
                'market_signal': scores.get('market_signal', {}),
                'narrative_fit': scores.get('narrative_fit', {}),
                'idea_potential': _compute_idea_potential(scores),
            }
            a['tags'] = {'sectors': s.get('sectors', []), 'narratives': s.get('narratives', [])}
            a['confidence'] = CONFIDENCE_MAP.get(conf_level, 0.85)
            a['confidence_level'] = conf_level
        else:
            a['scores'] = {'idea_potential': 0}
            a['tags'] = {'sectors': [], 'narratives': []}
            a['confidence'] = 0
            a['confidence_level'] = 'D'

        a['scored_at'] = datetime.now(timezone.utc).isoformat()
        scored_articles.append(a)

    # Re-rank pass (optional)
    if not skip_rerank:
        scored_articles.sort(key=lambda x: x['scores'].get('idea_potential', 0), reverse=True)
        top_20 = scored_articles[:20]
        low_conf = [a for a in scored_articles if a.get('confidence_level') in ('C', 'D') and a not in top_20]
        candidates = top_20 + low_conf

        if candidates:
            await progress("rerank", f"Re-ranking {len(candidates)} articles...")
            try:
                result = await llm.call(
                    prompt=_build_rerank_prompt(candidates),
                    model=rerank_model or model,
                    system_prompt=SCORING_SYSTEM_PROMPT,
                    max_tokens=8192,
                )
                total_cost += result.cost_usd
                reranked = _parse_json(result.content)
                rerank_map = {r['id']: r for r in reranked if 'id' in r}

                for a in scored_articles:
                    if a['id'] in rerank_map:
                        r = rerank_map[a['id']]
                        new_scores = r.get('scores', {})
                        a['scores'] = {
                            'content_quality': new_scores.get('content_quality', a['scores'].get('content_quality', {})),
                            'opportunity_signal': new_scores.get('opportunity_signal', a['scores'].get('opportunity_signal', {})),
                            'market_signal': new_scores.get('market_signal', a['scores'].get('market_signal', {})),
                            'narrative_fit': new_scores.get('narrative_fit', a['scores'].get('narrative_fit', {})),
                            'idea_potential': _compute_idea_potential(new_scores) if new_scores.get('content_quality') else a['scores'].get('idea_potential', 0),
                        }
                        a['tags'] = {'sectors': r.get('sectors', a['tags']['sectors']), 'narratives': r.get('narratives', a['tags']['narratives'])}
                        a['confidence'] = CONFIDENCE_MAP.get(r.get('confidence_level', 'A'), 1.0)
                        a['confidence_level'] = r.get('confidence_level', 'A')

                await progress("rerank", f"Re-ranked {len(rerank_map)} articles")
            except Exception as e:
                await progress("warning", f"Re-rank failed: {e}")

    # Sort by idea_potential
    scored_articles.sort(key=lambda x: x['scores'].get('idea_potential', 0), reverse=True)

    stats = {
        'total': len(scored_articles),
        'high_potential': sum(1 for a in scored_articles if a['scores'].get('idea_potential', 0) >= 7.5),
        'medium_potential': sum(1 for a in scored_articles if 6.5 <= a['scores'].get('idea_potential', 0) < 7.5),
        'low_potential': sum(1 for a in scored_articles if a['scores'].get('idea_potential', 0) < 6.5),
    }

    await progress("done", f"Scored {len(scored_articles)} articles (cost: ${total_cost:.2f})")

    return {
        'scored_articles': scored_articles,
        'stats': stats,
        'costs': {'total_usd': round(total_cost, 4), 'input_tokens': total_in, 'output_tokens': total_out},
    }
