"""
Provider factory — creates the right provider bundle based on user config.
"""

from __future__ import annotations

from engine.core.providers import Providers, provider_has_search
from engine.adapters.litellm_provider import LiteLLMProvider
from engine.adapters.supabase_storage import SupabaseStorage
from engine.adapters.tavily_search import TavilySearch


def create_providers(
    api_key: str,
    provider: str,
    model: str,
    user_id: str,
    tavily_key: str | None = None,
) -> Providers:
    """Create a Providers bundle for a user session.

    Args:
        api_key: User's decrypted LLM API key
        provider: LLM provider name (openai, anthropic, gemini, deepseek, etc.)
        model: Model name (gpt-5.4, claude-sonnet-4-6, etc.)
        user_id: Supabase user ID
        tavily_key: Optional Tavily API key for providers without built-in search
    """
    llm = LiteLLMProvider(api_key=api_key, provider=provider, default_model=model)
    storage = SupabaseStorage()

    search = None
    if not provider_has_search(provider) and tavily_key:
        search = TavilySearch(api_key=tavily_key)

    return Providers(
        llm=llm,
        storage=storage,
        search=search,
        user_id=user_id,
        model=model,
    )
