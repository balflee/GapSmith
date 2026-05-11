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


def create_multi_providers(
    persona_configs: dict[str, dict],
    user_id: str,
    tavily_key: str | None = None,
) -> Providers:
    """Create a Providers bundle with per-persona LLMs (mixed-model debate).

    Args:
        persona_configs: dict mapping persona name → config dict with keys
            {provider, model, api_key}. Personas the runner expects:
            "proposer", "challenger", "analyst", "reviewer", "defender",
            "strategist". Sub-agents (trend_scout, benchmark_hunter, etc.)
            inherit from their parent persona via SUB_AGENT_INHERITS map
            unless explicitly overridden here.
        user_id: Supabase user ID (audit / quota tracking)
        tavily_key: Optional Tavily API key. ANY persona without
            built-in-search gets the Tavily fallback.

    Behavior:
        - Builds one LiteLLMProvider per unique (provider, api_key) tuple
          — keys stay encrypted in env per call, never logged.
        - The default `llm` field is set to the proposer's provider so
          sub-agents lacking explicit config still get a sane fallback if
          their parent persona also lacks config (defensive path).
        - Tavily configured globally (single Tavily key for the run) —
          search is shared across all personas regardless of their LLM.
    """
    if not persona_configs:
        raise ValueError("persona_configs must not be empty for multi-provider mode")

    # Build one provider per persona. Note: this creates separate
    # LiteLLMProvider instances even when two personas use the same key —
    # tiny overhead, far simpler than dedup + reference-count.
    persona_llms: dict[str, tuple[LiteLLMProvider, str]] = {}
    for persona, cfg in persona_configs.items():
        if not all(k in cfg for k in ("provider", "model", "api_key")):
            raise ValueError(f"persona_configs[{persona!r}] missing provider/model/api_key")
        llm = LiteLLMProvider(
            api_key=cfg["api_key"],
            provider=cfg["provider"],
            default_model=cfg["model"],
        )
        persona_llms[persona] = (llm, cfg["model"])

    # Default llm/model: prefer proposer (the run's primary voice). Falls
    # back to the first persona in the dict so we never have a NULL llm.
    default_persona = "proposer" if "proposer" in persona_llms else next(iter(persona_llms))
    default_llm, default_model = persona_llms[default_persona]

    storage = SupabaseStorage()

    # Tavily: enabled globally if key provided AND any persona is on a
    # provider that lacks built-in search. Keeps us from spinning up
    # Tavily for an all-Gemini bundle.
    search = None
    needs_external_search = any(
        not provider_has_search(cfg["provider"]) for cfg in persona_configs.values()
    )
    if needs_external_search and tavily_key:
        search = TavilySearch(api_key=tavily_key)

    return Providers(
        llm=default_llm,
        storage=storage,
        search=search,
        user_id=user_id,
        model=default_model,
        persona_llms=persona_llms,
    )
