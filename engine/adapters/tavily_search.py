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
        response = await self.client.search(
            query=query,
            max_results=num_results,
            search_depth="basic",
        )
        results = []
        for r in response.get("results", []):
            results.append(SearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=r.get("content", "")[:500],
            ))
        return results
