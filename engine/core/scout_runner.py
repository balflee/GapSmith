"""
Scout Runner — orchestrates the full Scout pipeline:
  RSS Fetch → Pain Fetch → Score Articles → Score Pain → Curate

This is the main entry point called by the FastAPI endpoint.
"""

import asyncio
import json
import re
from engine.core.providers import Providers
from engine.core.rss_fetcher import run_rss_fetch
from engine.core.pain_fetcher import run_pain_fetch
from engine.core.pain_discovery_runner import run_pain_discovery
from engine.core.score_runner import run_scoring
from engine.core.pain_score_runner import run_pain_scoring
from engine.core.curation_runner import run_curation


async def run_scout(
    session_id: str,
    sectors: list[str],
    providers: Providers,
    on_progress: callable = None,
    focus_keywords: list[str] | None = None,
) -> dict:
    """
    Run the full Scout pipeline.

    Args:
        session_id: Supabase session ID for progress updates.
        sectors: List of sector names (e.g. ["AI/ML", "SaaS", "Fintech"]).
        providers: Bundle of LLM, Storage, Search providers.
        on_progress: Optional callback(step, message, pct).

    Returns:
        dict with full Scout report data.
    """
    model = providers.model
    total_cost = 0.0
    total_in_tokens = 0
    total_out_tokens = 0

    async def progress(step, msg, pct=None):
        if on_progress:
            await on_progress(step, msg, pct)

    try:
        await providers.storage.update_status("scout_reports", session_id, "running")

        # Map frontend sector IDs to data source sector IDs
        # Frontend sends lowercase IDs (e.g. "saas", "ai-ml", "healthtech")
        # Data sources use numeric IDs from rss_sources.md / pain_sources.md
        sector_name_to_id = {
            "ai-ml": 1,          # AI Agents & LLM Tooling
            "saas": 3,           # SaaS & Developer Tools
            "fintech": 6,        # Fintech & Payments
            "cybersecurity": 7,  # Security & Compliance
            "ecommerce": 9,      # E-commerce & Marketplace
            "edtech": 10,        # EdTech & Online Learning
            "healthtech": 11,    # HealthTech & Wellness
            "creator": 12,       # Creator Economy & Media
            "logistics": 15,     # Supply Chain & Logistics
            "proptech": 16,      # Real Estate & PropTech
            "climate": 17,       # Climate & Energy
            "devtools": 5,       # DevOps & Infrastructure
        }
        sector_ids = [sector_name_to_id[s] for s in sectors if s in sector_name_to_id]
        sector_ids = sector_ids or None

        # === Phase 1: Fetch (parallel) ===
        sector_names = ", ".join(sectors[:3])
        await progress("fetch", f"Scanning RSS feeds for {sector_names}...", 5)

        rss_task = run_rss_fetch(sector_ids=sector_ids)
        pain_task = run_pain_fetch(sector_ids=sector_ids)
        rss_result, pain_result = await asyncio.gather(rss_task, pain_task)

        articles = rss_result['articles']
        posts = pain_result['posts']

        rss_sources = rss_result.get('stats', {}).get('total_sources', '?')
        pain_sources = pain_result.get('stats', {}).get('total_sources', '?')
        await progress("fetch", f"Scanned {rss_sources} RSS feeds, found {len(articles)} articles", 10)
        await progress("fetch", f"Scanned {pain_sources} pain sources, found {len(posts)} signals", 15)
        await progress("fetch_done", f"Total: {len(articles)} articles + {len(posts)} pain signals", 18)

        # === Phase 1b: AI Pain Discovery + Web Search Validation ===
        await progress("scanning", f"Discovering hidden pain points via AI + web search...", 20)

        async def on_discovery_progress(step, msg):
            await progress("scanning", f"[Discovery] {msg}", None)

        discovery_result = await run_pain_discovery(
            sectors=sectors,
            llm=providers.llm,
            search=providers.search,
            model=model,
            on_progress=on_discovery_progress,
        )
        discovered_posts = discovery_result['posts']
        total_cost += discovery_result['costs']['total_usd']
        total_in_tokens += discovery_result['costs'].get('input_tokens', 0)
        total_out_tokens += discovery_result['costs'].get('output_tokens', 0)

        # Merge discovered pain posts with fetched ones
        posts.extend(discovered_posts)
        await progress("fetch_done", f"Added {len(discovered_posts)} AI-discovered pain points (total: {len(posts)} signals)", 30)

        # === Phase 2: Score (sequential for better progress) ===
        await progress("score", f"Sending {len(articles)} articles to {model} for AI scoring...", 35)

        # Article scoring with per-batch progress (35% → 50%)
        async def on_article_progress(step, msg):
            await progress("score", f"[Articles] {msg}", None)

        score_result = await run_scoring(
            articles=articles,
            llm=providers.llm,
            model=model,
            skip_rerank=True,
            on_progress=on_article_progress,
        )
        scored_articles = score_result['scored_articles']
        total_cost += score_result['costs']['total_usd']
        total_in_tokens += score_result['costs'].get('input_tokens', 0)
        total_out_tokens += score_result['costs'].get('output_tokens', 0)

        await progress("score", f"Scored {len(scored_articles)}/{len(articles)} articles (${score_result['costs']['total_usd']:.2f})", 50)

        # Pain scoring with per-batch progress (52% → 65%)
        await progress("score", f"Scoring {len(posts)} pain signals...", 52)

        async def on_pain_progress(step, msg):
            await progress("score", f"[Pain signals] {msg}", None)

        pain_score_result = await run_pain_scoring(
            posts=posts,
            llm=providers.llm,
            model=model,
            on_progress=on_pain_progress,
        )
        scored_posts = pain_score_result['scored_posts']
        clusters = pain_score_result['clusters']
        total_cost += pain_score_result['costs']['total_usd']
        total_in_tokens += pain_score_result['costs'].get('input_tokens', 0)
        total_out_tokens += pain_score_result['costs'].get('output_tokens', 0)

        await progress("score_done", f"Scored {len(scored_posts)} pain posts, found {len(clusters)} clusters", 65)

        # === Phase 3: Curate ===
        await progress("curate", "Generating daily brief...", 70)

        curation_result = await run_curation(
            scored_articles=scored_articles,
            scored_posts=scored_posts,
            clusters=clusters,
            llm=providers.llm,
            model=model,
            search=providers.search,
        )
        total_cost += curation_result['costs']['total_usd']
        total_in_tokens += curation_result['costs'].get('input_tokens', 0)
        total_out_tokens += curation_result['costs'].get('output_tokens', 0)

        topics = curation_result.get('topics', [])
        await progress("curate", f"Identified {len(topics) if isinstance(topics, list) else '?'} topics and cross-signals", 85)
        await progress("curate_done", "Curation complete, building report...", 90)

        # === Save results ===
        await progress("save", "Saving report to database...", 95)

        # Build structured report
        gaps = []
        for a in scored_articles[:10]:
            gaps.append({
                'title': a.get('title', ''),
                'source': a.get('source_name', ''),
                'idea_potential': a.get('scores', {}).get('idea_potential', 0),
                'sectors': a.get('tags', {}).get('sectors', []),
                'narratives': a.get('tags', {}).get('narratives', []),
                'confidence': a.get('confidence_level', '?'),
                'keyword_matches': [],
            })

        pain_clusters = curation_result['pain_signals']
        for pc in pain_clusters:
            pc['keyword_matches'] = []

        trends = curation_result['cross_signals']

        # LLM-based keyword matching (if user provided focus keywords)
        if focus_keywords and (gaps or pain_clusters):
            await progress("save", "Matching focus keywords with AI...", 93)
            try:
                items_for_matching = []
                for i, g in enumerate(gaps):
                    items_for_matching.append({"idx": f"gap-{i}", "text": g['title']})
                for i, pc in enumerate(pain_clusters):
                    items_for_matching.append({"idx": f"pain-{i}", "text": pc.get('theme', '')})

                match_prompt = f"""Given these focus keywords from the user: {json.dumps(focus_keywords)}

And these signals:
{json.dumps(items_for_matching, ensure_ascii=False)}

For each signal, determine which focus keywords are semantically relevant (not just exact match — use meaning).
Return a JSON object mapping idx to matched keywords array. Only include entries that have matches.

Example: {{"gap-0": ["AI code review"], "pain-2": ["compliance"]}}

Output ONLY the JSON object."""

                match_result = await providers.llm.call(
                    prompt=match_prompt,
                    model=model,
                    max_tokens=2048,
                    temperature=0.1,
                )
                total_cost += match_result.cost_usd
                total_in_tokens += match_result.input_tokens
                total_out_tokens += match_result.output_tokens

                # Parse matches
                match_text = match_result.content.strip()
                match_text = re.sub(r'^```json\s*', '', match_text)
                match_text = re.sub(r'\s*```$', '', match_text)
                matches = json.loads(match_text)

                for key, kws in matches.items():
                    if key.startswith("gap-"):
                        idx = int(key.split("-")[1])
                        if idx < len(gaps):
                            gaps[idx]['keyword_matches'] = kws
                    elif key.startswith("pain-"):
                        idx = int(key.split("-")[1])
                        if idx < len(pain_clusters):
                            pain_clusters[idx]['keyword_matches'] = kws

                matched_count = sum(1 for g in gaps if g['keyword_matches']) + sum(1 for pc in pain_clusters if pc['keyword_matches'])
                await progress("save", f"Matched {matched_count} signals to your keywords", None)
            except Exception:
                pass  # Non-critical — report still works without keyword matches

        await providers.storage.save_scout_results(
            session_id=session_id,
            gaps=gaps,
            pain_clusters=pain_clusters,
            trends=trends,
            daily_brief=json.dumps(curation_result.get('daily_brief', {}), ensure_ascii=False),
            topics=json.dumps(curation_result.get('topics', []), ensure_ascii=False),
            keywords=curation_result.get('keywords', []),
            total_cost_usd=total_cost,
            total_input_tokens=total_in_tokens,
            total_output_tokens=total_out_tokens,
            model=model,
        )

        total_tokens = total_in_tokens + total_out_tokens
        await progress("done", f"Scout complete! {total_tokens:,} tokens, ${total_cost:.4f}", 100)

        return {
            'session_id': session_id,
            'gaps': gaps,
            'pain_clusters': pain_clusters,
            'trends': trends,
            'daily_brief': curation_result['daily_brief'],
            'topics': curation_result['topics'],
            'keywords': curation_result['keywords'],
            'stats': {
                'articles_fetched': len(articles),
                'articles_scored': len(scored_articles),
                'pain_fetched': len(posts),
                'pain_scored': len(scored_posts),
                'clusters': len(clusters),
            },
            'costs': {'total_usd': round(total_cost, 4)},
        }

    except Exception as e:
        await providers.storage.update_status("scout_reports", session_id, "error")
        raise
