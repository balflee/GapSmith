"""
RSS Fetcher — adapted from Idea Generator pipeline for GapSmith web.
Fetches RSS feeds, filters/deduplicates articles, returns structured data.
No file I/O — all results returned as data for Supabase storage.
"""

import re
import json
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict
import asyncio
import aiohttp
import feedparser

# Configuration
ENGINE_DIR = Path(__file__).parent.parent
DATA_DIR = ENGINE_DIR / "data"
RSS_MD_PATH = DATA_DIR / "rss_sources.md"

# Request settings
REQUEST_TIMEOUT = 30
MAX_CONCURRENT_REQUESTS = 10
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Content filtering
MIN_CONTENT_LENGTH = 500
MAX_AGE_HOURS = 120  # 5 days — not all sources publish daily

# Headline deduplication
SIMILARITY_THRESHOLD = 0.6
STOPWORDS = {'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
             'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
             'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
             'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'with',
             'as', 'by', 'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
             'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
             'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
             'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
             'very', 'just', 'also'}


@dataclass
class FeedSource:
    name: str
    url: str
    lang: str
    tier: Optional[int] = None
    category: Optional[str] = None
    sectors: list = None


@dataclass
class Article:
    id: str
    source_name: str
    source_url: str
    title: str
    link: str
    published: Optional[str]
    updated: Optional[str]
    summary: Optional[str]
    content: Optional[str]
    author: Optional[str]
    tags: list
    lang: str
    fetched_at: str
    category: Optional[str] = None


def generate_article_id(link: str, title: str) -> str:
    content = f"{link}:{title}"
    return hashlib.md5(content.encode()).hexdigest()[:12]


def parse_rss_md(filepath: Path = None) -> list[FeedSource]:
    """Parse rss_sources.md and extract all RSS feed URLs with metadata."""
    filepath = filepath or RSS_MD_PATH
    sources = []

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    current_category = None
    current_tier = None

    table_pattern = r'\|\s*([^|]+)\s*\|\s*(https?://[^\s|]+)\s*\|\s*(\w+(?:-\w+)?)\s*\|'
    sectors_pattern = r'\|\s*([^|]+)\s*\|\s*(https?://[^\s|]+)\s*\|\s*(\w+(?:-\w+)?)\s*\|\s*([^|]*)\s*\|'

    for line in content.split('\n'):
        if line.startswith('## '):
            header = line.lower()
            current_category = line[3:].strip()
            if 'tier 1' in header: current_tier = 1
            elif 'tier 2' in header: current_tier = 2
            elif 'tier 3' in header: current_tier = 3
            elif 'tier 4' in header: current_tier = 4
            elif 'protocol' in header: current_tier = 3
            elif 'github' in header: current_tier = 3
            else: current_tier = current_tier or 4

        match4 = re.search(sectors_pattern, line)
        if match4:
            name = match4.group(1).strip()
            url = match4.group(2).strip()
            lang = match4.group(3).strip()
            sectors_str = match4.group(4).strip()

            if name.lower() == 'name' or url.lower() == 'url':
                continue

            sector_ids = [int(s.strip()) for s in sectors_str.split(',') if s.strip().isdigit()] if sectors_str else []
            sources.append(FeedSource(
                name=name, url=url, lang=lang,
                tier=current_tier, category=current_category,
                sectors=sector_ids,
            ))
            continue

        match3 = re.search(table_pattern, line)
        if match3:
            name = match3.group(1).strip()
            url = match3.group(2).strip()
            lang = match3.group(3).strip()

            if name.lower() == 'name' or url.lower() == 'url':
                continue

            sources.append(FeedSource(
                name=name, url=url, lang=lang,
                tier=current_tier, category=current_category,
                sectors=[],
            ))

    return sources


def parse_datetime(entry: dict) -> tuple[Optional[str], Optional[str]]:
    published = None
    updated = None

    if hasattr(entry, 'published_parsed') and entry.published_parsed:
        try:
            published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc).isoformat()
        except:
            pass
    elif hasattr(entry, 'published') and entry.published:
        published = entry.published

    if hasattr(entry, 'updated_parsed') and entry.updated_parsed:
        try:
            updated = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc).isoformat()
        except:
            pass
    elif hasattr(entry, 'updated') and entry.updated:
        updated = entry.updated

    return published, updated


def extract_content(entry: dict) -> Optional[str]:
    if hasattr(entry, 'content') and entry.content:
        if isinstance(entry.content, list) and len(entry.content) > 0:
            return entry.content[0].get('value', '')
    if hasattr(entry, 'content_encoded'):
        return entry.content_encoded
    return None


def extract_tags(entry: dict) -> list[str]:
    tags = []
    if hasattr(entry, 'tags') and entry.tags:
        for tag in entry.tags:
            if isinstance(tag, dict) and 'term' in tag:
                tags.append(tag['term'])
            elif hasattr(tag, 'term'):
                tags.append(tag.term)
    return tags


def get_content_length(article: Article) -> int:
    length = 0
    if article.title: length += len(article.title)
    if article.summary: length += len(article.summary)
    if article.content: length += len(article.content)
    return length


def normalize_title(title: str) -> set:
    title = title.lower()
    title = re.sub(r'[^\w\s]', ' ', title)
    words = set(title.split())
    words = words - STOPWORDS
    words = {w for w in words if len(w) > 2}
    return words


def jaccard_similarity(set1: set, set2: set) -> float:
    if not set1 or not set2:
        return 0.0
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    return intersection / union if union > 0 else 0.0


def deduplicate_by_headline(articles: list[Article]) -> tuple[list[Article], list[dict]]:
    if not articles:
        return [], []

    tier_priority = {
        'industry_definers': 1, 'research': 2, 'community': 3,
        'protocols': 3, 'github': 3, 'news_en': 4, 'news_zh': 4, 'developer': 4,
    }

    article_words = [(article, normalize_title(article.title)) for article in articles]
    kept = []
    removed = []
    used_indices = set()

    for i, (article_i, words_i) in enumerate(article_words):
        if i in used_indices:
            continue

        similar_group = [(i, article_i)]

        for j, (article_j, words_j) in enumerate(article_words):
            if j <= i or j in used_indices:
                continue
            if article_i.source_name == article_j.source_name:
                continue

            similarity = jaccard_similarity(words_i, words_j)
            if similarity >= SIMILARITY_THRESHOLD:
                similar_group.append((j, article_j))
                used_indices.add(j)

        if len(similar_group) == 1:
            kept.append(article_i)
        else:
            def get_priority(item):
                idx, art = item
                tier = tier_priority.get(art.category, 5)
                pub_date = art.published or art.updated or ''
                return (tier, -hash(pub_date))

            similar_group.sort(key=get_priority)
            best_idx, best_article = similar_group[0]
            kept.append(best_article)

            for idx, dup_article in similar_group[1:]:
                removed.append({
                    'title': dup_article.title,
                    'source': dup_article.source_name,
                    'similar_to': best_article.title,
                    'kept_source': best_article.source_name
                })

        used_indices.add(i)

    return kept, removed


async def fetch_feed(session: aiohttp.ClientSession, source: FeedSource) -> tuple[FeedSource, Optional[str], Optional[str]]:
    try:
        headers = {'User-Agent': USER_AGENT}
        async with session.get(source.url, timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT), headers=headers) as response:
            if response.status == 200:
                content = await response.text()
                return source, content, None
            else:
                return source, None, f"HTTP {response.status}"
    except asyncio.TimeoutError:
        return source, None, "Timeout"
    except Exception as e:
        return source, None, str(e)


def parse_feed(source: FeedSource, content: str, fetched_at: str) -> list[Article]:
    articles = []
    feed = feedparser.parse(content)

    for entry in feed.entries:
        title = getattr(entry, 'title', 'Untitled')
        link = getattr(entry, 'link', '')
        if not link:
            continue

        published, updated = parse_datetime(entry)
        summary = getattr(entry, 'summary', None)
        content_text = extract_content(entry)
        author = getattr(entry, 'author', None)
        tags = extract_tags(entry)

        article = Article(
            id=generate_article_id(link, title),
            source_name=source.name,
            source_url=source.url,
            title=title,
            link=link,
            published=published,
            updated=updated,
            summary=summary,
            content=content_text,
            author=author,
            tags=tags,
            lang=source.lang,
            fetched_at=fetched_at,
            category=source.category,
        )
        articles.append(article)

    return articles


async def fetch_all_feeds(sources: list[FeedSource]) -> list:
    connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT_REQUESTS)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [fetch_feed(session, source) for source in sources]
        results = await asyncio.gather(*tasks)
    return results


# --- Main entry point for web usage ---

async def run_rss_fetch(
    sector_ids: list[int] | None = None,
    sources_path: Path | None = None,
    on_progress: callable = None,
) -> dict:
    """
    Fetch and filter RSS articles.

    Args:
        sector_ids: Filter to these sector IDs. None = all.
        sources_path: Path to rss_sources.md. None = default.
        on_progress: Optional callback(step, message) for progress updates.

    Returns:
        dict with keys: articles (list[dict]), stats (dict)
    """
    def progress(step, msg):
        if on_progress:
            on_progress(step, msg)

    progress("parse_sources", "Parsing RSS sources...")
    sources = parse_rss_md(sources_path)

    if sector_ids:
        sector_set = set(sector_ids)
        sources = [s for s in sources if s.sectors and any(sid in sector_set for sid in s.sectors)]

    progress("fetch_feeds", f"Fetching {len(sources)} RSS feeds...")
    fetched_at = datetime.now(timezone.utc).isoformat()
    results = await fetch_all_feeds(sources)

    progress("filter_articles", "Filtering and deduplicating articles...")
    all_new_articles = []
    stats = {
        'total_sources': len(sources),
        'successful': 0,
        'failed': 0,
        'errors': [],
        'total_fetched': 0,
        'total_new': 0,
        'total_duplicate': 0,
        'total_filtered_short': 0,
        'total_filtered_old': 0,
        'total_similar_removed': 0,
    }

    seen_ids = set()  # Web mode: no persistent state, deduplicate within this run
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_AGE_HOURS)

    for source, content, error in results:
        if error:
            stats['failed'] += 1
            stats['errors'].append({'source': source.name, 'error': error})
        else:
            stats['successful'] += 1
            articles = parse_feed(source, content, fetched_at)

            new_articles = []
            for article in articles:
                if article.id in seen_ids:
                    stats['total_duplicate'] += 1
                    continue

                pub_str = article.published or article.updated
                if pub_str:
                    try:
                        pub_dt = datetime.fromisoformat(pub_str)
                        if pub_dt < cutoff:
                            stats['total_filtered_old'] += 1
                            seen_ids.add(article.id)
                            continue
                    except (ValueError, TypeError):
                        pass

                content_len = get_content_length(article)
                if content_len < MIN_CONTENT_LENGTH:
                    stats['total_filtered_short'] += 1
                    seen_ids.add(article.id)
                    continue

                new_articles.append(article)
                seen_ids.add(article.id)

            stats['total_fetched'] += len(articles)
            all_new_articles.extend(new_articles)

    progress("dedup_headlines", "Removing similar headlines...")
    all_new_articles, similar_removed = deduplicate_by_headline(all_new_articles)
    stats['total_similar_removed'] = len(similar_removed)
    stats['total_new'] = len(all_new_articles)

    # Sort newest first
    all_new_articles.sort(key=lambda x: x.published or x.updated or '', reverse=True)

    progress("done", f"Found {stats['total_new']} articles from {stats['successful']} sources")

    return {
        'articles': [asdict(a) for a in all_new_articles],
        'stats': stats,
    }
