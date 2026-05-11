"""
Unit tests for the mixed-LLM Providers infrastructure (the engine half of
/lab/debate-room). Two surfaces:

1. Providers.for_persona() — returns a Providers view with llm/model
   swapped to the persona's config, with sub-agent inheritance fallback.
2. factory.create_multi_providers() — builds the bundle from a per-
   persona config dict.

These exercise the abstraction WITHOUT touching real LLM APIs. The full
end-to-end mixed-model debate is tested via smoke against MiniMax once
the lab UI ships (separate harness).
"""

from unittest.mock import MagicMock, patch

import pytest

from engine.core.providers import Providers, SUB_AGENT_INHERITS


def _stub_llm(name: str = "stub"):
    """Tiny LLMProvider stub — only needs identity for the assertions."""
    m = MagicMock()
    m.name = name  # convenience for asserting which LLM came back
    return m


# ---------------------------------------------------------------
# for_persona — direct lookup
# ---------------------------------------------------------------

def test_for_persona_returns_default_when_no_overrides():
    """No persona_llms map = always return default. This is the single-
    provider Prove path; must keep working unchanged."""
    default_llm = _stub_llm("default")
    p = Providers(llm=default_llm, storage=MagicMock(), model="gpt-5.4")
    assert p.for_persona("proposer").llm is default_llm
    assert p.for_persona("anything").llm is default_llm
    assert p.for_persona("anything").model == "gpt-5.4"


def test_for_persona_uses_specific_config_when_present():
    default_llm = _stub_llm("default")
    proposer_llm = _stub_llm("proposer")
    challenger_llm = _stub_llm("challenger")
    p = Providers(
        llm=default_llm, storage=MagicMock(), model="gpt-5.4",
        persona_llms={
            "proposer": (proposer_llm, "claude-opus-4-7"),
            "challenger": (challenger_llm, "gpt-5.5"),
        },
    )
    assert p.for_persona("proposer").llm is proposer_llm
    assert p.for_persona("proposer").model == "claude-opus-4-7"
    assert p.for_persona("challenger").llm is challenger_llm
    assert p.for_persona("challenger").model == "gpt-5.5"


def test_for_persona_returns_default_for_unconfigured_persona():
    """Persona has no entry → fall back to default llm/model."""
    default_llm = _stub_llm("default")
    p = Providers(
        llm=default_llm, storage=MagicMock(), model="gpt-5.4",
        persona_llms={"proposer": (_stub_llm("p"), "claude-opus-4-7")},
    )
    # analyst not configured → default
    assert p.for_persona("analyst").llm is default_llm


# ---------------------------------------------------------------
# for_persona — fallback chain
# ---------------------------------------------------------------

def test_for_persona_uses_explicit_fallback_when_persona_missing():
    proposer_llm = _stub_llm("proposer")
    p = Providers(
        llm=_stub_llm("default"), storage=MagicMock(), model="gpt-5.4",
        persona_llms={"proposer": (proposer_llm, "claude-opus-4-7")},
    )
    # trend_scout not in map → fall back to proposer (explicit arg)
    result = p.for_persona("trend_scout", fallback="proposer")
    assert result.llm is proposer_llm
    assert result.model == "claude-opus-4-7"


def test_for_persona_auto_resolves_subagent_inheritance():
    """If persona is in SUB_AGENT_INHERITS, fall back to parent persona
    automatically (no need to pass fallback= explicitly at every call site)."""
    proposer_llm = _stub_llm("proposer")
    challenger_llm = _stub_llm("challenger")
    analyst_llm = _stub_llm("analyst")
    defender_llm = _stub_llm("defender")
    p = Providers(
        llm=_stub_llm("default"), storage=MagicMock(), model="default-model",
        persona_llms={
            "proposer": (proposer_llm, "claude"),
            "challenger": (challenger_llm, "gpt"),
            "analyst": (analyst_llm, "gemini"),
            "defender": (defender_llm, "minimax"),
        },
    )
    # SUB_AGENT_INHERITS expects: trend_scout→proposer, contrarian→challenger,
    # gap_finder→challenger, benchmark_hunter→analyst, evidence_hunter→defender
    assert p.for_persona("trend_scout").llm is proposer_llm
    assert p.for_persona("contrarian").llm is challenger_llm
    assert p.for_persona("gap_finder").llm is challenger_llm
    assert p.for_persona("benchmark_hunter").llm is analyst_llm
    assert p.for_persona("evidence_hunter").llm is defender_llm


def test_for_persona_specific_overrides_inheritance():
    """If a sub-agent has its own entry, use that — don't fall back to
    the parent persona."""
    proposer_llm = _stub_llm("proposer")
    trend_scout_llm = _stub_llm("trend_scout_specific")
    p = Providers(
        llm=_stub_llm("default"), storage=MagicMock(), model="default-model",
        persona_llms={
            "proposer": (proposer_llm, "claude"),
            "trend_scout": (trend_scout_llm, "gemini-flash"),
        },
    )
    # trend_scout has its own entry → use it, don't inherit from proposer
    assert p.for_persona("trend_scout").llm is trend_scout_llm
    assert p.for_persona("trend_scout").model == "gemini-flash"


def test_for_persona_preserves_persona_llms_through_chained_calls():
    """Calling for_persona() must not strip persona_llms — otherwise
    a Defender shadowed at top of run_phase_c couldn't then ask for
    Evidence Hunter's provider down the line."""
    proposer_llm = _stub_llm("proposer")
    defender_llm = _stub_llm("defender")
    p = Providers(
        llm=_stub_llm("default"), storage=MagicMock(), model="default-model",
        persona_llms={
            "proposer": (proposer_llm, "claude"),
            "defender": (defender_llm, "minimax"),
        },
    )
    defender_view = p.for_persona("defender")
    # Chained call from the defender view should still find proposer's LLM
    assert defender_view.for_persona("proposer").llm is proposer_llm
    # And persona_llms is preserved (not deleted by replace())
    assert "proposer" in defender_view.persona_llms


# ---------------------------------------------------------------
# create_multi_providers
# ---------------------------------------------------------------

def test_create_multi_providers_builds_persona_map():
    """Factory builds one LiteLLMProvider per persona; default llm falls to
    proposer's. We patch SupabaseStorage so tests don't need DB env vars."""
    pytest.importorskip("litellm")
    with patch("engine.core.factory.SupabaseStorage") as MockStorage:
        MockStorage.return_value = MagicMock()
        from engine.core.factory import create_multi_providers
        p = create_multi_providers(
            persona_configs={
                "proposer": {"provider": "anthropic", "model": "claude-opus-4-7", "api_key": "sk-test-1"},
                "challenger": {"provider": "openai", "model": "gpt-5.4", "api_key": "sk-test-2"},
            },
            user_id="test-user",
        )
    assert "proposer" in p.persona_llms
    assert "challenger" in p.persona_llms
    assert p.persona_llms["proposer"][1] == "claude-opus-4-7"
    assert p.persona_llms["challenger"][1] == "gpt-5.4"
    # Default = proposer's LLM (it's the run's primary voice)
    assert p.llm is p.persona_llms["proposer"][0]
    assert p.model == "claude-opus-4-7"


def test_create_multi_providers_rejects_empty_config():
    pytest.importorskip("litellm")
    from engine.core.factory import create_multi_providers
    with pytest.raises(ValueError, match="must not be empty"):
        create_multi_providers(persona_configs={}, user_id="u")


def test_create_multi_providers_rejects_incomplete_persona():
    pytest.importorskip("litellm")
    from engine.core.factory import create_multi_providers
    with pytest.raises(ValueError, match="missing"):
        create_multi_providers(
            persona_configs={"proposer": {"provider": "anthropic"}},  # missing model + api_key
            user_id="u",
        )


# ---------------------------------------------------------------
# Sub-agent inheritance map sanity
# ---------------------------------------------------------------

def test_sub_agent_inheritance_map_covers_known_subagents():
    """Lock down the 5 sub-agents the runner spawns. Adding a new sub-agent
    must update SUB_AGENT_INHERITS or this test will fail-loud."""
    expected = {"trend_scout", "benchmark_hunter", "evidence_hunter", "contrarian", "gap_finder"}
    assert set(SUB_AGENT_INHERITS.keys()) == expected
    # All parents should be one of the 6 main personas
    main_personas = {"proposer", "challenger", "analyst", "reviewer", "defender", "strategist"}
    for sub, parent in SUB_AGENT_INHERITS.items():
        assert parent in main_personas, f"{sub} inherits from unknown persona {parent}"
