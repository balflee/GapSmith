"""
Curation Runner — takes scored articles + pain posts → generates structured JSON
for Daily Brief, Startup Topics, Pain Signals, Keywords, Cross-Signals.

Outputs structured JSON (not markdown) for product-grade frontend rendering.
"""

import asyncio
import json
import re
from collections import Counter
from datetime import datetime, timezone

from engine.core.providers import LLMProvider, LLMResponse, SearchProvider


def _parse_json_output(text: str) -> dict | list | None:
    """Extract JSON from LLM output, handling fences and commentary."""
    text = text.strip()
    # Strip ```json fences
    match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
    if match:
        text = match.group(1)
    else:
        # Strip any ``` fences
        text = re.sub(r'^```\w*\n', '', text)
        text = re.sub(r'\n```\s*$', '', text)

    # Try parsing the whole thing
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Try finding a JSON object or array
    for pattern in [r'\{[\s\S]*\}', r'\[[\s\S]*\]']:
        match = re.search(pattern, text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                continue

    return None


# ============================================================
# Preprocessing (pure Python, no LLM)
# ============================================================

def preprocess(scored_articles: list[dict], scored_posts: list[dict], clusters: list[dict]) -> dict:
    """Build structured context from scored data for LLM prompts."""
    top_articles = sorted(
        scored_articles,
        key=lambda a: a.get("scores", {}).get("idea_potential", 0),
        reverse=True,
    )[:10]

    by_sector = Counter()
    for a in scored_articles:
        for sec in a.get("tags", {}).get("sectors", []):
            by_sector[sec] += 1

    by_narrative = Counter()
    for a in scored_articles:
        for n in a.get("tags", {}).get("narratives", []):
            by_narrative[n] += 1

    painkillers = sorted(scored_posts, key=lambda p: p.get("pain_score", 0), reverse=True)[:20]

    active_clusters = sorted(
        clusters,
        key=lambda c: c.get("mention_count", 0) * c.get("avg_score", 0),
        reverse=True,
    )[:15]

    keywords = _extract_keywords(top_articles, painkillers, active_clusters)
    cross_signals = _find_cross_signals(top_articles, active_clusters)

    # Pain sector counts for heatmap
    pain_by_sector = Counter()
    for c in clusters:
        sector = c.get("sector", "Other")
        if sector != "Other":
            pain_by_sector[sector] += c.get("mention_count", 1)

    return {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "news": {
            "total": len(scored_articles),
            "top_articles": top_articles,
            "by_sector": dict(by_sector.most_common()),
            "by_narrative": dict(by_narrative.most_common()),
        },
        "pain": {
            "total": len(scored_posts),
            "painkillers": painkillers,
            "by_sector": dict(pain_by_sector.most_common()),
        },
        "clusters": active_clusters,
        "keywords": keywords,
        "cross_signals": cross_signals,
    }


def _extract_keywords(top_articles: list, painkillers: list, clusters: list) -> list[dict]:
    words = Counter()
    for a in top_articles:
        for w in re.findall(r'[A-Za-z]{4,}', a.get("title", "")):
            words[w.lower()] += 2
        for sec in a.get("tags", {}).get("sectors", []):
            words[sec.lower()] += 3
        for n in a.get("tags", {}).get("narratives", []):
            words[n.lower()] += 3
    for p in painkillers:
        for w in re.findall(r'[A-Za-z]{4,}', p.get("pain_theme", "")):
            words[w.lower()] += 1
        sector = p.get("sector", "")
        if sector:
            words[sector.lower()] += 2
    # Cap per-cluster contribution per word at 3 — otherwise one popular
    # cluster (e.g. mention_count=34) floods the top of the keyword list
    # with every content word from its single theme sentence
    # (unilaterally, imposing, processes, patterns, functioning, causing,
    # dread, loss, page... all tied at 34). The cluster's mention_count
    # already shows up in the cluster card itself; the keyword list should
    # surface words that recur across many sources, not within one
    # description.
    for c in clusters:
        weight = min(c.get("mention_count", 1), 3)
        for w in re.findall(r'[A-Za-z]{4,}', c.get("theme", "")):
            words[w.lower()] += weight

    # Stopword list — generic English filler that adds zero signal value.
    # Extended after 2026-04 audit (sonnet/grok runs surfaced "winner",
    # "questioning", "lack", "tech", "industry", "especially", "advancements",
    # "without", "using", "despite", "down", "last", "real", "life", "over",
    # "post", "mark", "selection" as top "keywords" — pure noise).
    stopwords = {
        # connectives / determiners
        'this', 'that', 'with', 'from', 'have', 'been', 'your', 'what',
        'when', 'will', 'about', 'more', 'some', 'just', 'like', 'than',
        'them', 'into', 'most', 'also', 'very', 'much', 'does', 'being',
        'where', 'while', 'without', 'within', 'through', 'across', 'over',
        'under', 'down', 'between', 'around', 'after', 'before', 'still',
        'until', 'such', 'each', 'other', 'their', 'there', 'these', 'those',
        'because', 'although', 'though', 'whether', 'despite', 'however',
        'whereas', 'unless', 'whose', 'whom',
        # weak nouns / fillers
        'thing', 'things', 'stuff', 'kind', 'sort', 'part', 'parts', 'side',
        'last', 'next', 'first', 'long', 'short', 'real', 'life', 'time',
        'times', 'year', 'years', 'today', 'week', 'month', 'months', 'day',
        'days', 'high', 'low', 'good', 'bad', 'great', 'lots', 'often',
        # weak verbs / -ing forms
        'using', 'making', 'taking', 'getting', 'going', 'coming', 'doing',
        'looking', 'questioning', 'posing', 'forcing', 'looking', 'finding',
        # weak adjectives
        'especially', 'mainly', 'mostly', 'really', 'actually', 'maybe',
        'particularly', 'simply', 'clearly', 'easily', 'quickly',
        # vague abstract nouns surfaced as "keywords"
        'tech', 'industry', 'advancements', 'winner', 'mark',
        'selection', 'post', 'launch',  # generic e-commerce filler
        # pronouns / aux
        'they', 'were', 'would', 'could', 'should', 'shall', 'might', 'must',
        'cant', 'wont', 'dont', 'didnt', 'isnt', 'arent', 'wasnt', 'werent',
        'cannot',  # observed 2026-04-29 in fintech/proptech run
        # generic verbs / adjectives that crept in after the per-cluster cap
        'build', 'builds', 'built', 'partners', 'partner',
        'significant', 'significantly', 'critical', 'crucial', 'important',
        'major', 'minor', 'general', 'specific',
    }

    # Also drop entries that are generic single-letter / digit-heavy garbage,
    # and require the word to be at least 5 chars OR appear ≥3× to qualify.
    # The min-length tokenizer is already 4+, so just enforce min-count.
    cleaned = [
        (w, c) for w, c in words.most_common(60)
        if w not in stopwords and c >= 2
    ]
    return [{"keyword": w, "count": c} for w, c in cleaned[:30]]


def _find_cross_signals(top_articles: list, clusters: list) -> list[dict]:
    news_sectors = Counter()
    for a in top_articles:
        for sec in a.get("tags", {}).get("sectors", []):
            news_sectors[sec] += 1
    pain_sectors = Counter()
    for c in clusters:
        sector = c.get("sector", "Other")
        if sector != "Other":
            pain_sectors[sector] += c.get("mention_count", 1)
    overlap = []
    for sec in set(news_sectors) & set(pain_sectors):
        overlap.append({"sector": sec, "news_count": news_sectors[sec],
                        "pain_mentions": pain_sectors[sec], "strength": news_sectors[sec] + pain_sectors[sec]})
    overlap.sort(key=lambda x: x["strength"], reverse=True)
    return overlap


def _generate_pain_signals(clusters: list) -> list[dict]:
    return [
        {
            "id": c.get("id", ""),
            "theme": c.get("theme", ""),
            "sector": c.get("sector", ""),
            "mention_count": c.get("mention_count", 0),
            "avg_score": c.get("avg_score", 0),
            "trend": c.get("trend", "stable"),
        }
        for c in clusters[:10]
    ]


# ============================================================
# LLM Prompts — JSON output
# ============================================================

def _build_brief_prompt(ctx: dict) -> str:
    articles_data = []
    for a in ctx["news"]["top_articles"][:10]:
        articles_data.append({
            "title": a.get("title", "")[:100],
            "source": a.get("source_name", ""),
            "score": round(a.get("scores", {}).get("idea_potential", 0), 1),
            "confidence": a.get("confidence_level", "?"),
            "sectors": a.get("tags", {}).get("sectors", []),
        })

    pain_data = []
    for p in ctx["pain"]["painkillers"][:10]:
        pain_data.append({
            "theme": p.get("pain_theme", "")[:100],
            "source": p.get("source_name", ""),
            "score": round(p.get("pain_score", 0), 1),
        })

    return f"""Analyze today's market signals and produce a structured Daily Brief.

## Input Data

Date: {ctx['date']}
Total RSS Articles: {ctx['news']['total']}
Total Pain Signals: {ctx['pain']['total']}
Active Clusters: {len(ctx['clusters'])}

Top 10 Articles (by idea_potential):
{json.dumps(articles_data, indent=2)}

Top 10 Pain Points:
{json.dumps(pain_data, indent=2)}

Sector Distribution (RSS): {json.dumps(ctx['news']['by_sector'])}
Sector Distribution (Pain): {json.dumps(ctx['pain'].get('by_sector', {}))}
Narrative Distribution: {json.dumps(ctx['news']['by_narrative'])}

Cross-Sector Signals: {json.dumps(ctx['cross_signals'])}

Synthesized Market Pain Themes: {json.dumps(ctx.get('synthesized_pains', []), indent=2)}

Web Search Context: {json.dumps(ctx.get('web_enrichment', [])[:8], indent=2)}

## Instructions

Generate a JSON object with your analysis. Use the synthesized pain themes (not raw GitHub issues) for your cross-signal insights. You must provide:
1. overview: 2-3 sentence executive summary of the most important patterns
2. takeaway: One sentence actionable insight for a founder
3. article_summaries: For each of the top articles, write a 1-2 sentence summary of why it matters for startup opportunities
4. narrative_analysis: For each narrative theme, assess its trend and explain why
5. cross_signal_insights: For the strongest cross-signals (where RSS news + pain overlap), explain the startup opportunity

## Output (strict JSON, no other text)

```json
{{
  "overview": "2-3 sentence executive summary...",
  "takeaway": "One actionable sentence...",
  "article_summaries": [
    {{"title": "Article title", "summary": "Why this matters for startups..."}}
  ],
  "narrative_analysis": [
    {{"name": "Narrative name", "trend": "heating_up|steady|cooling", "note": "Why..."}}
  ],
  "cross_signal_insights": [
    {{"article": "Article title", "pain_point": "Pain theme", "insight": "The startup opportunity...", "strength": "strong|moderate|weak"}}
  ]
}}
```

Output ONLY the JSON object."""


def _build_topics_prompt(ctx: dict, brief_overview: str) -> str:
    articles_data = []
    for a in ctx["news"]["top_articles"][:10]:
        content = re.sub(r'<[^>]+>', '', a.get('content', '') or a.get('summary', ''))
        content = ' '.join(content.split())[:300]
        articles_data.append({
            "title": a.get("title", "")[:100],
            "source": a.get("source_name", ""),
            "score": round(a.get("scores", {}).get("idea_potential", 0), 1),
            "sectors": a.get("tags", {}).get("sectors", []),
            "content_snippet": content,
        })

    clusters_data = []
    for c in ctx["clusters"][:10]:
        clusters_data.append({
            "theme": c.get("theme", "")[:100],
            "sector": c.get("sector", ""),
            "mentions": c.get("mention_count", 0),
            "avg_score": round(c.get("avg_score", 0), 1),
        })

    pain_data = []
    for p in ctx["pain"]["painkillers"][:10]:
        pain_data.append({
            "theme": p.get("pain_theme", "")[:100],
            "source": p.get("source_name", ""),
            "score": round(p.get("pain_score", 0), 1),
        })

    synth_pains = json.dumps(ctx.get('synthesized_pains', []), indent=2)
    web_context = json.dumps(ctx.get('web_enrichment', [])[:8], indent=2)

    return f"""You are a startup opportunity researcher. Synthesize 3 startup topics from today's signals.

## Context
{brief_overview}

## Data

Top Articles:
{json.dumps(articles_data, indent=2)}

Synthesized Market Pain Themes (use these, not raw GitHub issues):
{synth_pains}

Web Search Context (market-level validation):
{web_context}

Raw Pain Clusters (for reference):
{json.dumps(clusters_data, indent=2)}

Cross-Signals: {json.dumps(ctx['cross_signals'])}

## Rules
1. Each Topic = Trend Signal + Pain Signal + Core Question
2. Find the INTERSECTION: "This trend is happening + these users are suffering = startup opportunity"
3. **DIVERSITY**: Each topic MUST cover a DIFFERENT angle or approach. Avoid 3 topics in the same niche. Consider: different target users, different business models, different technical approaches
4. Use MARKET-LEVEL pain themes from the synthesis, NOT raw GitHub issue titles
5. Core question must be actionable — a founder can start brainstorming immediately
6. Cite specific data: article titles, scores, pain themes, mention counts

## Output (strict JSON array, no other text)

```json
[
  {{
    "title": "Short topic title",
    "trend_signal": {{
      "article": "Article title",
      "source": "Source name",
      "score": 6.3,
      "insight": "Why this trend creates an opportunity"
    }},
    "pain_signals": [
      {{"theme": "Market-level pain theme (NOT raw GitHub issue title)", "severity": "critical", "signal_count": 5, "description": "Why this pain matters at market level"}}
    ],
    "core_question": "One sentence startup question a founder can act on",
    "sectors": ["Sector1", "Sector2"]
  }}
]
```

Output ONLY the JSON array with exactly 3 topics."""


# ============================================================
# Web search enrichment + Pain synthesis
# ============================================================

async def _web_search_enrichment(
    sectors: list[str], search: SearchProvider | None, on_progress=None,
) -> list[dict]:
    """Search web for market-level pain points per sector. Returns enrichment context."""
    if not search or not sectors:
        return []

    enrichments = []
    for sector in sectors[:3]:
        queries = [
            f"{sector} startup pain points 2026",
            f"{sector} biggest problems frustrations users",
        ]
        for q in queries:
            try:
                results = await search.search(q, num_results=3)
                for r in results:
                    enrichments.append({
                        "sector": sector,
                        "title": r.title[:100],
                        "snippet": r.snippet[:200],
                        "source": r.url,
                    })
            except Exception:
                continue
    return enrichments[:15]


def _build_pain_synthesis_prompt(painkillers: list[dict], clusters: list[dict], web_enrichment: list[dict]) -> str:
    """Ask LLM to synthesize granular pain posts into market-level themes."""
    pain_data = []
    for p in painkillers[:20]:
        pain_data.append({
            "theme": p.get("pain_theme", "")[:100],
            "source": p.get("source_name", ""),
            "score": round(p.get("pain_score", 0), 1),
        })

    cluster_data = []
    for c in clusters[:10]:
        cluster_data.append({
            "theme": c.get("theme", "")[:100],
            "sector": c.get("sector", ""),
            "mentions": c.get("mention_count", 0),
        })

    web_context = ""
    if web_enrichment:
        web_context = f"""
## Web Search Context (market-level pain points from the web)
{json.dumps(web_enrichment[:10], indent=2)}

Use these web results to validate and enrich your pain themes with market-level language.
"""

    return f"""You are a market analyst. Below are raw pain signals from GitHub Issues, Reddit, HN, and AI discovery.
Many are low-level bug reports or feature requests. Your job is to synthesize them into 4-6 MARKET-LEVEL pain themes.

## Rules
1. Group related issues into broader themes (e.g., 3 different CI bugs → "CI/CD reliability and testing gaps")
2. Each theme should represent a real market pain that a startup could address
3. Use market language, not technical jargon from individual issues
4. Include how many raw signals support each theme
5. Assess severity: critical (people are losing money/time), moderate (significant friction), mild (inconvenience)

## Raw Pain Signals
{json.dumps(pain_data, indent=2)}

## Raw Clusters
{json.dumps(cluster_data, indent=2)}
{web_context}
## Output (strict JSON array)

```json
[
  {{
    "theme": "Market-level pain theme title",
    "description": "2-3 sentence description of the pain in market terms",
    "severity": "critical|moderate|mild",
    "signal_count": 5,
    "evidence": ["specific pain post 1", "specific pain post 2"],
    "sectors": ["Sector1"]
  }}
]
```

Output ONLY the JSON array."""


# ============================================================
# Main entry point
# ============================================================

async def run_curation(
    scored_articles: list[dict],
    scored_posts: list[dict],
    clusters: list[dict],
    llm: LLMProvider,
    model: str = "gpt-5.4",
    topics_model: str | None = None,
    search: SearchProvider | None = None,
    on_progress: callable = None,
) -> dict:
    """Run curation pipeline: preprocess → web enrich → pain synthesis → brief → topics."""

    async def progress(step, msg):
        if on_progress:
            result = on_progress(step, msg)
            if asyncio.isfuture(result) or asyncio.iscoroutine(result):
                await result

    total_cost = 0.0
    total_in = 0
    total_out = 0

    # Step 1: Preprocess
    await progress("preprocess", "Preprocessing scored data...")
    ctx = preprocess(scored_articles, scored_posts, clusters)
    pain_signals = _generate_pain_signals(ctx["clusters"])

    if not scored_articles and not scored_posts:
        empty_brief = {
            "overview": "No data collected. Check RSS and pain source configuration.",
            "takeaway": "Ensure data sources are configured and accessible.",
            "article_summaries": [], "narrative_analysis": [],
            "cross_signal_insights": [],
        }
        return {
            'daily_brief': empty_brief,
            'topics': [],
            'pain_signals': pain_signals,
            'keywords': ctx['keywords'],
            'cross_signals': ctx['cross_signals'],
            'costs': {'total_usd': 0, 'input_tokens': 0, 'output_tokens': 0},
        }

    # Step 2: Web search enrichment (if search provider available)
    web_enrichment = []
    if search:
        await progress("enrich", "Searching web for market-level pain signals...")
        top_sectors = [s["sector"] for s in ctx.get("cross_signals", [])[:3]]
        if not top_sectors:
            top_sectors = list(ctx["news"]["by_sector"].keys())[:2]
        web_enrichment = await _web_search_enrichment(top_sectors, search)
        if web_enrichment:
            await progress("enrich", f"Found {len(web_enrichment)} web signals across {len(top_sectors)} sectors")

    # Step 3: Pain synthesis (turn granular issues into market themes)
    await progress("synthesis", "Synthesizing pain signals into market themes...")
    synthesized_pains = []
    try:
        synth_result = await llm.call(
            prompt=_build_pain_synthesis_prompt(ctx["pain"]["painkillers"], ctx["clusters"], web_enrichment),
            model=model,
            max_tokens=2048,
            temperature=0.5,
        )
        total_cost += synth_result.cost_usd
        total_in += synth_result.input_tokens
        total_out += synth_result.output_tokens
        parsed = _parse_json_output(synth_result.content)
        if isinstance(parsed, list):
            synthesized_pains = parsed
            await progress("synthesis", f"Identified {len(synthesized_pains)} market-level pain themes")
    except Exception:
        pass

    # Inject synthesized pains into context for brief and topics
    ctx["synthesized_pains"] = synthesized_pains
    ctx["web_enrichment"] = web_enrichment

    # Step 4: Generate Daily Brief (JSON)
    await progress("brief", "Generating Daily Brief...")
    brief_data = None
    try:
        brief_result = await llm.call(
            prompt=_build_brief_prompt(ctx),
            model=model,
            max_tokens=4096,
            temperature=0.5,
        )
        total_cost += brief_result.cost_usd
        total_in += brief_result.input_tokens
        total_out += brief_result.output_tokens
        brief_data = _parse_json_output(brief_result.content)
    except Exception as e:
        brief_data = None

    if not isinstance(brief_data, dict):
        brief_data = {
            "overview": "Brief generation failed. Showing raw data only.",
            "takeaway": "",
            "article_summaries": [], "narrative_analysis": [],
            "cross_signal_insights": [],
        }

    # Hydrate brief with structured data from preprocessing
    sector_heatmap = []
    for sector, count in ctx["news"]["by_sector"].items():
        pain_count = ctx["pain"].get("by_sector", {}).get(sector, 0)
        sector_heatmap.append({"sector": sector, "count": count, "pain_count": pain_count})
    sector_heatmap.sort(key=lambda x: x["count"] + x["pain_count"], reverse=True)

    # Merge article metadata into summaries
    summaries_by_title = {s.get("title", ""): s.get("summary", "") for s in brief_data.get("article_summaries", [])}
    top_articles_enriched = []
    for a in ctx["news"]["top_articles"][:8]:
        title = a.get("title", "")
        top_articles_enriched.append({
            "title": title,
            "source": a.get("source_name", ""),
            "score": round(a.get("scores", {}).get("idea_potential", 0), 1),
            "confidence": a.get("confidence_level", "?"),
            "sectors": a.get("tags", {}).get("sectors", []),
            "summary": summaries_by_title.get(title, summaries_by_title.get(title[:80], "")),
        })

    # Merge narrative counts into analysis
    narrative_by_name = {n.get("name", ""): n for n in brief_data.get("narrative_analysis", [])}
    narratives_enriched = []
    for name, count in ctx["news"]["by_narrative"].items():
        analysis = narrative_by_name.get(name, {})
        narratives_enriched.append({
            "name": name,
            "count": count,
            "trend": analysis.get("trend", "steady"),
            "note": analysis.get("note", ""),
        })
    narratives_enriched.sort(key=lambda x: x["count"], reverse=True)

    daily_brief = {
        "date": ctx["date"],
        "overview": brief_data.get("overview", ""),
        "takeaway": brief_data.get("takeaway", ""),
        "stats": {
            "articles": ctx["news"]["total"],
            "pain_signals": ctx["pain"]["total"],
            "clusters": len(ctx["clusters"]),
        },
        "top_articles": top_articles_enriched,
        "sector_heatmap": sector_heatmap[:8],
        "narratives": narratives_enriched[:6],
        "cross_signals": brief_data.get("cross_signal_insights", []),
    }

    # Step 3: Generate Topics (JSON)
    await progress("topics", "Generating Startup Topics...")
    topics_data = None
    try:
        topics_result = await llm.call(
            prompt=_build_topics_prompt(ctx, brief_data.get("overview", "")),
            model=topics_model or model,
            max_tokens=4096,
            temperature=0.7,
        )
        total_cost += topics_result.cost_usd
        total_in += topics_result.input_tokens
        total_out += topics_result.output_tokens
        topics_data = _parse_json_output(topics_result.content)
    except Exception:
        topics_data = None

    if not isinstance(topics_data, list):
        topics_data = []

    await progress("done", f"Curation complete (cost: ${total_cost:.2f})")

    return {
        'daily_brief': daily_brief,
        'topics': topics_data,
        'pain_signals': pain_signals,
        'keywords': ctx['keywords'],
        'cross_signals': ctx['cross_signals'],
        'costs': {'total_usd': round(total_cost, 4), 'input_tokens': total_in, 'output_tokens': total_out},
    }
