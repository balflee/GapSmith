"""
Unit tests for upstream-error-classified quota refund (engine/api.py).

Why this exists: the failure mode is ambient — a single Gemini/Anthropic
5xx during a Forge run silently consumed 1 of 6 annual quota slots
without any user-facing acknowledgement. These tests lock down the two
moving parts that prevent that:

1. _is_upstream_error correctly tags litellm-style provider failures
   AND leaves validator/parsing/our-bug failures untagged so we don't
   over-refund.

2. _maybe_refund_quota:
   - Calls storage.refund_quota for upstream errors on UI runs
   - Skips refund for upstream errors on agent x402 jobs (those settle
     via the x402 payment record, not consume_quota)
   - Skips refund for non-upstream errors regardless of path
   - Never raises into the caller's error handler (refund is best-effort)
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from engine.api import _is_upstream_error, _maybe_refund_quota


# ---------------------------------------------------------------
# _is_upstream_error — classification
# ---------------------------------------------------------------

class FakeServiceUnavailableError(Exception):
    """Mimics litellm.ServiceUnavailableError without importing litellm."""
    pass


class FakeRateLimitError(Exception):
    pass


class FakeAPIConnectionError(Exception):
    pass


class FakeOverloadedError(Exception):
    """Mimics anthropic.OverloadedError (529)."""
    pass


def test_classifies_service_unavailable_by_class_name():
    # Class-name match: even without inheriting from litellm.* directly
    # (which mocks/tests rarely do), the name match catches it.
    assert _is_upstream_error(FakeServiceUnavailableError("Gemini 503")) is True


def test_classifies_rate_limit():
    assert _is_upstream_error(FakeRateLimitError("429 too many requests")) is True


def test_classifies_api_connection():
    assert _is_upstream_error(FakeAPIConnectionError("connection reset")) is True


def test_classifies_anthropic_overloaded():
    assert _is_upstream_error(FakeOverloadedError("Overloaded — try again")) is True


def test_classifies_by_message_when_class_name_unknown():
    # Generic Exception with telltale message — covers cases where litellm
    # rewraps an upstream error as a base Exception with the status text.
    assert _is_upstream_error(Exception("503 Service Unavailable")) is True
    assert _is_upstream_error(Exception("GeminiException 529 overloaded")) is True
    assert _is_upstream_error(RuntimeError("upstream model timed out")) is True


def test_does_not_classify_validator_or_parsing_errors():
    # These are delivered runs (validator quality warning) or our bugs
    # (JSON parse failure) — refunding for these would mask quality
    # signal and hide bugs. They stay non-upstream → quota stays
    # consumed → we hear about it.
    assert _is_upstream_error(ValueError("bad JSON in strategist output")) is False
    assert _is_upstream_error(KeyError("missing 'top_ideas'")) is False
    assert _is_upstream_error(AssertionError("RICE score must be 0-10")) is False


def test_does_not_classify_random_runtime_error():
    assert _is_upstream_error(RuntimeError("some internal logic failed")) is False


# ---------------------------------------------------------------
# _maybe_refund_quota — dispatch behavior
# ---------------------------------------------------------------

def _make_providers(refund_result: dict | None = None):
    """Build a fake providers object with a stub storage.refund_quota."""
    storage = MagicMock()
    storage.refund_quota = AsyncMock(return_value=refund_result or {"ok": True, "remaining": 5})
    providers = MagicMock()
    providers.storage = storage
    return providers


def test_refunds_when_upstream_error_and_ui_run():
    providers = _make_providers()
    exc = FakeServiceUnavailableError("Gemini 503")

    asyncio.run(_maybe_refund_quota(providers, "user-abc", "forge", None, exc))

    providers.storage.refund_quota.assert_awaited_once_with("user-abc", "forge")


def test_does_not_refund_when_agent_job():
    """Agent x402 jobs settle via the x402 payment record, not the
    consume_quota counter (pseudo-user has no quota row). Refunding here
    would just emit a noisy 'nothing_to_refund' log line on every agent
    failure. Skipping is correct behavior."""
    providers = _make_providers()
    exc = FakeServiceUnavailableError("Gemini 503")

    asyncio.run(_maybe_refund_quota(providers, "agent-pseudo", "forge", "job-xyz", exc))

    providers.storage.refund_quota.assert_not_awaited()


def test_does_not_refund_when_non_upstream_error():
    """Validator quality warning, JSON parse bug, our orchestration bug —
    none of those are upstream-blameless. Quota stays consumed so we hear
    about the failure rate from billing data."""
    providers = _make_providers()
    exc = ValueError("bad JSON")

    asyncio.run(_maybe_refund_quota(providers, "user-abc", "forge", None, exc))

    providers.storage.refund_quota.assert_not_awaited()


def test_swallows_refund_rpc_exception():
    """Storage layer raising while we try to refund must NOT bubble out —
    the engine is already in an error path; a secondary failure in
    refund must not mask the original error or crash the bg task."""
    providers = _make_providers()
    providers.storage.refund_quota = AsyncMock(side_effect=RuntimeError("supabase down"))
    exc = FakeServiceUnavailableError("Gemini 503")

    # Should not raise
    asyncio.run(_maybe_refund_quota(providers, "user-abc", "forge", None, exc))


def test_logs_no_op_when_refund_returns_nothing_to_refund():
    """If consume_quota wasn't actually called (race condition: refund
    fires before consume completes) the RPC returns
    {ok:false, reason:nothing_to_refund}. _maybe_refund_quota logs and
    moves on — we don't want to retry/loop on that."""
    providers = _make_providers(refund_result={"ok": False, "reason": "nothing_to_refund"})
    exc = FakeServiceUnavailableError("Gemini 503")

    # Should not raise; should still call refund_quota (RPC handles it)
    asyncio.run(_maybe_refund_quota(providers, "user-abc", "scout", None, exc))
    providers.storage.refund_quota.assert_awaited_once_with("user-abc", "scout")


def test_handles_none_refund_result():
    """Storage adapter returns None on infrastructure error — should not
    raise."""
    providers = _make_providers(refund_result=None)
    exc = FakeServiceUnavailableError("Gemini 503")

    asyncio.run(_maybe_refund_quota(providers, "user-abc", "prove", None, exc))
    providers.storage.refund_quota.assert_awaited_once()
