"""
Pain Fetcher — adapted from Idea Generator pipeline for GapSmith web.
Fetches Reddit, GitHub Issues, HN for pain signals. Pre-filters by keywords.
No file I/O — all results returned as data.
"""

import re
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict
import asyncio
import aiohttp
import feedparser

# Configuration
ENGINE_DIR = Path(__file__).parent.parent
DATA_DIR = ENGINE_DIR / "data"
PAIN_MD_PATH = DATA_DIR / "pain_sources.md"

REQUEST_TIMEOUT = 30
MAX_CONCURRENT_REQUESTS = 10
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

MIN_CONTENT_LENGTH = 30

PAIN_KEYWORDS = {
    'frustrating', 'frustrated', 'frustration', 'annoying', 'annoyed',
    'broken', 'breaks', 'broke', 'bug', 'bugs', 'buggy',
    'problem', 'problems', 'issue', 'issues',
    'error', 'errors', 'fail', 'failed', 'failing', 'failure',
    "can't", 'cannot', 'unable', 'impossible',
    'confusing', 'confused', 'confusion', 'unclear',
    'terrible', 'horrible', 'awful', 'worst',
    'hate', 'hated', 'hating',
    'wish', 'wished', 'hoping',
    'nightmare', 'painful', 'pain',
    'stuck', 'blocked', 'blocking',
    'lost', 'losing', 'lose',
    'slow', 'slower', 'slowest', 'laggy', 'lag',
    'expensive', 'costly', 'overpriced',
    'scam', 'scammed', 'phishing',
    'vulnerability', 'exploit', 'hack', 'hacked',
    'unusable', 'useless', 'worthless',
    'workaround', 'work-around', 'hacky', 'kludge',
    'gave up', 'give up', 'giving up',
    'switched to', 'switching to', 'migrated',
    'wasted', 'waste of',
    'why is', 'why does', 'why can',
    'help me', 'please help', 'need help',
}

NOISE_KEYWORDS = {
    'moon', 'mooning', 'pump', 'pumping', 'dump', 'dumping',
    '100x', '1000x', '10x',
    'airdrop', 'airdrops', 'giveaway',
    'wen', 'lambo', 'lfg', 'wagmi', 'ngmi', 'nfa', 'dyor',
    'to the moon', 'diamond hands',
    'buy the dip', 'btd',
    'price prediction', 'price target',
    'bullish', 'bearish',
    'free money', 'easy money',
    'guaranteed', 'guaranteed profit',
    'shill', 'shilling',
    'upvote if', 'like if',
}

HIGH_SIGNAL_TYPES = {'github_issues', 'github_api'}


@dataclass
class PainSource:
    name: str
    url: str
    lang: str
    source_type: str
    sectors: list = None


@dataclass
class PainPost:
    id: str
    source_name: str
    source_url: str
    source_type: str
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
    pain_keywords_matched: list
    noise_keywords_matched: list
    passed_filter: bool


def generate_post_id(link: str, title: str) -> str:
    content = f"{link}:{title}"
    return hashlib.md5(content.encode()).hexdigest()[:12]


def parse_pain_sources_md(filepath: Path = None) -> list[PainSource]:
    filepath = filepath or PAIN_MD_PATH
    sources = []

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern5 = r'\|\s*([^|]+)\s*\|\s*(https?://[^\s|]+)\s*\|\s*(\w+(?:-\w+)?)\s*\|\s*(\w+(?:_\w+)?)\s*\|\s*([^|]*)\s*\|'
    pattern4 = r'\|\s*([^|]+)\s*\|\s*(https?://[^\s|]+)\s*\|\s*(\w+(?:-\w+)?)\s*\|\s*(\w+(?:_\w+)?)\s*\|'

    for line in content.split('\n'):
        match5 = re.search(pattern5, line)
        if match5:
            name = match5.group(1).strip()
            url = match5.group(2).strip()
            lang = match5.group(3).strip()
            source_type = match5.group(4).strip()
            sectors_str = match5.group(5).strip()

            if name.lower() == 'name' or url.lower() == 'url':
                continue

            sector_ids = [int(s.strip()) for s in sectors_str.split(',') if s.strip().isdigit()] if sectors_str else []
            sources.append(PainSource(name=name, url=url, lang=lang, source_type=source_type, sectors=sector_ids))
            continue

        match4 = re.search(pattern4, line)
        if match4:
            name = match4.group(1).strip()
            url = match4.group(2).strip()
            lang = match4.group(3).strip()
            source_type = match4.group(4).strip()

            if name.lower() == 'name' or url.lower() == 'url':
                continue

            sources.append(PainSource(name=name, url=url, lang=lang, source_type=source_type, sectors=[]))

    return sources


def strip_html(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def get_text_content(post: PainPost) -> str:
    parts = []
    if post.title: parts.append(post.title)
    if post.summary: parts.append(strip_html(post.summary))
    if post.content: parts.append(strip_html(post.content))
    return ' '.join(parts).lower()


def keyword_prefilter(post: PainPost) -> tuple[list, list, bool]:
    text = get_text_content(post)
    if post.source_type in HIGH_SIGNAL_TYPES:
        return [], [], True

    pain_matched = [kw for kw in PAIN_KEYWORDS if kw in text]
    noise_matched = [kw for kw in NOISE_KEYWORDS if kw in text]
    passed = len(pain_matched) > 0
    if len(text) < 50 and not pain_matched:
        passed = False

    return pain_matched, noise_matched, passed


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


def get_content_length(post: PainPost) -> int:
    length = 0
    if post.title: length += len(post.title)
    if post.summary: length += len(post.summary)
    if post.content: length += len(post.content)
    return length


async def fetch_feed(session: aiohttp.ClientSession, source: PainSource) -> tuple[PainSource, Optional[str], Optional[str]]:
    try:
        headers = {'User-Agent': USER_AGENT}
        if source.source_type == 'github_api':
            headers['Accept'] = 'application/vnd.github+json'
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


def parse_github_api(source: PainSource, content: str, fetched_at: str) -> list[PainPost]:
    posts = []
    try:
        issues = json.loads(content)
    except json.JSONDecodeError:
        return posts

    for issue in issues:
        if 'pull_request' in issue:
            continue
        title = issue.get('title', 'Untitled')
        link = issue.get('html_url', '')
        if not link:
            continue

        body = issue.get('body', '') or ''
        published = issue.get('created_at')
        updated = issue.get('updated_at')
        author = issue.get('user', {}).get('login', '')
        labels = [l.get('name', '') for l in issue.get('labels', [])]
        reactions = issue.get('reactions', {})
        comments_count = issue.get('comments', 0)

        reaction_str = ''
        if reactions:
            total = reactions.get('total_count', 0)
            if total > 0:
                reaction_str = f"\n[Reactions: {total} total, +1:{reactions.get('+1',0)}, -1:{reactions.get('-1',0)}, comments:{comments_count}]"

        post = PainPost(
            id=generate_post_id(link, title),
            source_name=source.name, source_url=source.url, source_type=source.source_type,
            title=title, link=link,
            published=published, updated=updated,
            summary=body[:500] + reaction_str if body else reaction_str,
            content=body, author=author, tags=labels,
            lang=source.lang, fetched_at=fetched_at,
            pain_keywords_matched=[], noise_keywords_matched=[], passed_filter=False,
        )
        posts.append(post)
    return posts


def parse_feed(source: PainSource, content: str, fetched_at: str) -> list[PainPost]:
    posts = []
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

        post = PainPost(
            id=generate_post_id(link, title),
            source_name=source.name, source_url=source.url, source_type=source.source_type,
            title=title, link=link,
            published=published, updated=updated,
            summary=summary, content=content_text,
            author=author, tags=tags,
            lang=source.lang, fetched_at=fetched_at,
            pain_keywords_matched=[], noise_keywords_matched=[], passed_filter=False,
        )
        posts.append(post)
    return posts


async def fetch_all_feeds(sources: list[PainSource]) -> list:
    connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT_REQUESTS)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [fetch_feed(session, source) for source in sources]
        results = await asyncio.gather(*tasks)
    return results


# --- Main entry point for web usage ---

async def run_pain_fetch(
    sector_ids: list[int] | None = None,
    sources_path: Path | None = None,
    on_progress: callable = None,
) -> dict:
    """
    Fetch and pre-filter pain signals.

    Returns:
        dict with keys: posts (list[dict]), stats (dict)
    """
    def progress(step, msg):
        if on_progress:
            on_progress(step, msg)

    progress("parse_sources", "Parsing pain sources...")
    sources = parse_pain_sources_md(sources_path)

    if sector_ids:
        sector_set = set(sector_ids)
        sources = [s for s in sources if s.sectors and any(sid in sector_set for sid in s.sectors)]

    progress("fetch_feeds", f"Fetching {len(sources)} pain sources...")
    fetched_at = datetime.now(timezone.utc).isoformat()
    results = await fetch_all_feeds(sources)

    progress("filter_posts", "Filtering pain signals...")
    all_posts = []
    seen_ids = set()
    stats = {
        'total_sources': len(sources),
        'successful': 0,
        'failed': 0,
        'errors': [],
        'total_fetched': 0,
        'total_duplicate': 0,
        'total_too_short': 0,
        'total_noise_rejected': 0,
        'total_no_pain': 0,
        'total_passed': 0,
    }

    for source, content, error in results:
        if error:
            stats['failed'] += 1
            stats['errors'].append({'source': source.name, 'error': error})
        else:
            stats['successful'] += 1
            if source.source_type == 'github_api':
                posts = parse_github_api(source, content, fetched_at)
            else:
                posts = parse_feed(source, content, fetched_at)

            for post in posts:
                if post.id in seen_ids:
                    stats['total_duplicate'] += 1
                    continue
                seen_ids.add(post.id)

                if source.source_type == 'reddit_search' and post.tags:
                    actual_sub = post.tags[0].lower()
                    target_sub = source.name.split('/')[1].split()[0].lower() if '/' in source.name else ""
                    if target_sub and actual_sub != target_sub:
                        stats['total_no_pain'] += 1
                        continue

                content_len = get_content_length(post)
                if content_len < MIN_CONTENT_LENGTH:
                    stats['total_too_short'] += 1
                    continue

                pain_matched, noise_matched, passed = keyword_prefilter(post)
                post.pain_keywords_matched = pain_matched
                post.noise_keywords_matched = noise_matched
                post.passed_filter = passed

                if not passed:
                    if noise_matched and not pain_matched:
                        stats['total_noise_rejected'] += 1
                    else:
                        stats['total_no_pain'] += 1
                    continue

                all_posts.append(post)

            stats['total_fetched'] += len(posts)

    stats['total_passed'] = len(all_posts)

    # Sort newest first
    all_posts.sort(key=lambda x: x.published or x.updated or '', reverse=True)

    progress("done", f"Found {stats['total_passed']} pain signals from {stats['successful']} sources")

    return {
        'posts': [asdict(p) for p in all_posts],
        'stats': stats,
    }
