"""
Unit tests for the engine /api/engine/health/llm preflight endpoint.

Exercised here in isolation (no FastAPI test client) — we call the
handler function directly with a stub LiteLLMProvider so the test
doesn't need network access or a real MiniMax key. The behavioral
contracts that matter:

  - Healthy LLM + healthy search → ok=True
  - LLM raises an upstream-class exception → ok=False, error_class="upstream"
  - LLM raises a config-class exception → ok=False, error_class="config"
  - Search failure does NOT break overall ok (graceful degrade)
  - Empty api_key short-circuits with a clear error
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from engine.api import health_llm, HealthCheckRequest


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if asyncio.get_event_loop().is_running() else asyncio.run(coro)


def _stub_resp(content="ok"):
    return SimpleNamespace(content=content, model="stub", input_tokens=1, output_tokens=1, cost_usd=0.0001)


def test_missing_api_key_returns_error():
    req = HealthCheckRequest(provider="minimax", model="MiniMax-M2.7", api_key="")
    out = asyncio.run(health_llm(req))
    assert out["ok"] is False
    assert "api_key" in out["error"]


def test_healthy_llm_and_search():
    """Both LLM ping and Tavily ping succeed — overall ok=True."""
    with patch("engine.adapters.litellm_provider.LiteLLMProvider") as MockLLM, \
         patch("engine.adapters.tavily_search.TavilySearch") as MockSearch, \
         patch.dict("os.environ", {"TAVILY_API_KEY": "fake"}):
        llm_inst = MagicMock()
        llm_inst.call = AsyncMock(return_value=_stub_resp("ok"))
        MockLLM.return_value = llm_inst
        search_inst = MagicMock()
        search_inst.search = AsyncMock(return_value=[])
        MockSearch.return_value = search_inst

        req = HealthCheckRequest(provider="minimax", model="MiniMax-M2.7", api_key="sk-test")
        out = asyncio.run(health_llm(req))

    assert out["ok"] is True
    assert out["llm_ok"] is True
    assert out["search_ok"] is True


def test_llm_503_classifies_as_upstream():
    """When the LLM call raises a 503-class exception, error_class must
    say 'upstream' so callers can surface 'retry later' to the agent
    rather than 'fix your config'."""
    class FakeServiceUnavailableError(Exception):
        pass

    with patch("engine.adapters.litellm_provider.LiteLLMProvider") as MockLLM:
        llm_inst = MagicMock()
        llm_inst.call = AsyncMock(side_effect=FakeServiceUnavailableError("Gemini 503"))
        MockLLM.return_value = llm_inst

        req = HealthCheckRequest(provider="google", model="gemini-3.1-pro", api_key="sk-test")
        out = asyncio.run(health_llm(req))

    assert out["ok"] is False
    assert out["llm_ok"] is False
    assert out["error_class"] == "upstream"
    assert "503" in out["error"] or "ServiceUnavailable" in out["error"]


def test_llm_bad_key_classifies_as_config():
    """A bad API key returns an auth error that's clearly NOT upstream —
    error_class must be 'config' so the wrapper sets a long Retry-After
    (operator must fix; agent retrying immediately won't help)."""
    with patch("engine.adapters.litellm_provider.LiteLLMProvider") as MockLLM:
        llm_inst = MagicMock()
        # ValueError is the LiteLLM idiom for bad-key / bad-config (not a 5xx)
        llm_inst.call = AsyncMock(side_effect=ValueError("Invalid api key"))
        MockLLM.return_value = llm_inst

        req = HealthCheckRequest(provider="minimax", model="MiniMax-M2.7", api_key="sk-bad")
        out = asyncio.run(health_llm(req))

    assert out["ok"] is False
    assert out["error_class"] == "config"


def test_search_failure_does_not_break_overall():
    """If LLM is fine but Tavily ping fails, overall ok still True. Engine
    pipeline degrades gracefully without search; we don't want to refuse
    402 advertisement just because Tavily blipped."""
    with patch("engine.adapters.litellm_provider.LiteLLMProvider") as MockLLM, \
         patch("engine.adapters.tavily_search.TavilySearch") as MockSearch, \
         patch.dict("os.environ", {"TAVILY_API_KEY": "fake"}):
        llm_inst = MagicMock()
        llm_inst.call = AsyncMock(return_value=_stub_resp("ok"))
        MockLLM.return_value = llm_inst
        search_inst = MagicMock()
        search_inst.search = AsyncMock(side_effect=Exception("Tavily down"))
        MockSearch.return_value = search_inst

        req = HealthCheckRequest(provider="minimax", model="MiniMax-M2.7", api_key="sk-test")
        out = asyncio.run(health_llm(req))

    # Critical: ok is True even though search failed
    assert out["ok"] is True
    assert out["llm_ok"] is True
    assert out["search_ok"] is False
    assert "Tavily" in out["search_error"]


def test_skip_search_when_check_search_false():
    """check_search=False → don't ping Tavily, leave search_ok=None."""
    with patch("engine.adapters.litellm_provider.LiteLLMProvider") as MockLLM:
        llm_inst = MagicMock()
        llm_inst.call = AsyncMock(return_value=_stub_resp("ok"))
        MockLLM.return_value = llm_inst

        req = HealthCheckRequest(
            provider="minimax", model="MiniMax-M2.7", api_key="sk-test", check_search=False,
        )
        out = asyncio.run(health_llm(req))

    assert out["ok"] is True
    assert out["search_ok"] is None
