"""
Tavily search adapter — external web search for providers without built-in search
(Claude, DeepSeek, MiniMax, Mistral).
"""

from __future__ import annotations

import os

from engine.core.providers import SearchResult

try:
    from tavily import AsyncTavilyClient
except ImportError:
    AsyncTavilyClient = None


class TavilySearch:
    """Search provider using Tavily API (~$0.005/search)."""

    def __init__(self, api_key: str | None = None):
        if AsyncTavilyClient is None:
            raise ImportError("tavily-python is required: pip install tavily-python")
        self.api_key = api_key or os.environ.get("TAVILY_API_KEY", "")
        if not self.api_key:
            raise ValueError("TAVILY_API_KEY is required for providers without built-in search")
        self.client = AsyncTavilyClient(api_key=self.api_key)

    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]:
        # search_depth="advanced" costs ~$0.025/search vs $0.005 basic. We use
        # advanced because GapSmith pipelines run search on niche / regulatory
        # / vertical queries (e.g. "Singapore banking compliance simulation",
        # "MAS TRM individual accountability framework", "ACAMS pricing per
        # learner") where basic-tier returns generic SaaS / LinkedIn slop
        # off-topic enough that agents explicitly call it out and quality-warn.
        # A Prove debate triggers ~30-50 searches → ~$0.75-1.25 added cost,
        # well under the $25 USDC charge and dwarfed by LLM cost.
        response = await self.client.search(
            query=query,
            max_results=num_results,
            search_depth="advanced",
        )
        results = []
        for r in response.get("results", []):
            results.append(SearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=r.get("content", "")[:500],
            ))
        return results
