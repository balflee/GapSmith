"""
Provider interfaces for GapSmith engine.
Abstracts LLM calls, storage, and search so the same pipeline logic
works with both CLI (claude subprocess) and Web (LiteLLM + Supabase).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable


@dataclass
class LLMResponse:
    """Standardized response from any LLM provider."""
    content: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    elapsed_s: float = 0.0


@dataclass
class SearchResult:
    """Single search result."""
    title: str
    url: str
    snippet: str


@runtime_checkable
class LLMProvider(Protocol):
    """Interface for LLM calls."""

    async def call(
        self,
        prompt: str,
        model: str,
        system_prompt: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse: ...

    async def call_with_search(
        self,
        prompt: str,
        model: str,
        system_prompt: str | None = None,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Call LLM with web search capability (grounding)."""
        ...


@runtime_checkable
class StorageProvider(Protocol):
    """Interface for session/report persistence."""

    async def save_state(self, session_id: str, state: dict) -> None: ...
    async def load_state(self, session_id: str) -> dict | None: ...
    async def update_status(self, table: str, session_id: str, status: str) -> None: ...
    async def append_round(self, session_id: str, round_data: dict) -> None: ...
    async def save_report(self, session_id: str, report: dict) -> None: ...


@runtime_checkable
class SearchProvider(Protocol):
    """Interface for web search (used when LLM has no built-in search)."""

    async def search(self, query: str, num_results: int = 5) -> list[SearchResult]: ...


@dataclass
class Providers:
    """Bundle of all provider implementations passed to pipeline runners."""
    llm: LLMProvider
    storage: StorageProvider
    search: SearchProvider | None = None
    user_id: str = ""
    model: str = "gpt-5.4"  # user's chosen model


# --- Provider capability detection ---

# Providers with built-in search reachable via the Chat Completions endpoint
# that LiteLLM uses. Both OpenAI's web_search_preview and xAI's web_search
# tool live on the Responses API only, so they're routed through Tavily.
# DeepSeek + Qwen are temporarily disabled in the UI; their entries here are
# retained so re-enabling them later is a one-line UI change.
PROVIDERS_WITH_SEARCH = {"gemini", "google"}

# Providers that need external search (Tavily fallback)
PROVIDERS_WITHOUT_SEARCH = {"anthropic", "openai", "xai", "deepseek", "minimax", "mistral", "qwen"}


def provider_has_search(provider_name: str) -> bool:
    """Check if a provider has built-in web search."""
    return provider_name.lower() in PROVIDERS_WITH_SEARCH
