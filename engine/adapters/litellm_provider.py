"""
LiteLLM adapter — unified LLM calls across Claude, GPT, Gemini, DeepSeek, Qwen, etc.
Users bring their own API key (BYOK).
"""

from __future__ import annotations

import asyncio
import time
from engine.core.providers import LLMResponse, SearchResult, provider_has_search

try:
    import litellm
    litellm.drop_params = True  # silently ignore unsupported params per provider
except ImportError:
    raise ImportError("litellm is required: pip install litellm")


class LiteLLMProvider:
    """LLM provider using LiteLLM for multi-model support."""

    # Providers that need OpenAI-compatible routing (api_base override)
    _OPENAI_COMPAT_PROVIDERS = {
        "minimax": {
            "api_base": "https://api.minimaxi.chat/v1",
            "prefix": "openai",
        },
    }

    # Custom pricing for providers not in LiteLLM's pricing DB (per 1K tokens)
    _CUSTOM_PRICING = {
        "MiniMax-M1": {"input": 0.002, "output": 0.008},
        "MiniMax-M2.5": {"input": 0.0015, "output": 0.006},
        "MiniMax-M2.7": {"input": 0.0015, "output": 0.006},
        "MiniMax-Text-01": {"input": 0.0004, "output": 0.0016},
    }

    def __init__(self, api_key: str, provider: str = "openai", default_model: str = "gpt-5.4"):
        self.api_key = api_key
        self.provider = provider
        self.default_model = default_model
        self._compat = self._OPENAI_COMPAT_PROVIDERS.get(provider.lower())
        self._configure_env(provider, api_key)

    def _configure_env(self, provider: str, api_key: str):
        """Set the appropriate env var for the provider."""
        import os
        provider_env_map = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "gemini": "GEMINI_API_KEY",
            "google": "GEMINI_API_KEY",
            "xai": "XAI_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
            "qwen": "DASHSCOPE_API_KEY",
            "minimax": "MINIMAX_API_KEY",
        }
        env_var = provider_env_map.get(provider.lower(), f"{provider.upper()}_API_KEY")
        os.environ[env_var] = api_key

    def _resolve_model(self, model: str) -> str:
        """Resolve model name to LiteLLM format if needed."""
        # LiteLLM uses provider/model format for some providers
        if "/" in model:
            return model

        # OpenAI-compatible providers: use openai/ prefix
        if self._compat:
            return f"{self._compat['prefix']}/{model}"

        # Map common short names
        model_map = {
            "sonnet": "claude-sonnet-4-6",
            "opus": "claude-opus-4-6",
            "haiku": "claude-haiku-4-5-20251001",
            # GPT 5.x family — current public models on the OpenAI Standard tier.
            # Older 4.x ids (gpt-4.1, gpt-4o) are intentionally not aliased; if a
            # caller passes one literally LiteLLM will route it as-is.
            "gpt-5.5-pro": "gpt-5.5-pro",
            "gpt-5.5": "gpt-5.5",
            "gpt-5.4-pro": "gpt-5.4-pro",
            "gpt-5.4": "gpt-5.4",
            "gpt-5.4-mini": "gpt-5.4-mini",
            "gpt-5.4-nano": "gpt-5.4-nano",
            # Gemini — current frontier (3.x preview) + stable 2.5 GA.
            # 2.0-flash is deprecating 2026-06-01 and intentionally not aliased.
            "gemini-3.1-pro-preview": "gemini/gemini-3.1-pro-preview",
            "gemini-3-flash-preview": "gemini/gemini-3-flash-preview",
            "gemini-3.1-flash-lite-preview": "gemini/gemini-3.1-flash-lite-preview",
            "gemini-2.5-pro": "gemini/gemini-2.5-pro",
            "gemini-2.5-flash": "gemini/gemini-2.5-flash",
            "gemini-2.5-flash-lite": "gemini/gemini-2.5-flash-lite",
            # Grok / xAI — OpenAI-compatible, routed via xai/ in LiteLLM.
            "grok-4": "xai/grok-4",
            "grok-4-1-fast-reasoning": "xai/grok-4-1-fast-reasoning",
            "grok-4-1-fast-non-reasoning": "xai/grok-4-1-fast-non-reasoning",
            "grok-4-fast-reasoning": "xai/grok-4-fast-reasoning",
            "grok-4-fast-non-reasoning": "xai/grok-4-fast-non-reasoning",
        }
        return model_map.get(model, model)

    def _estimate_cost(self, resolved_model: str, in_tokens: int, out_tokens: int, response=None) -> float:
        """Estimate cost using LiteLLM or custom pricing fallback."""
        try:
            cost = litellm.completion_cost(completion_response=response) or 0.0
            if cost > 0:
                return cost
        except Exception:
            pass
        # Fallback: custom pricing lookup by raw model name (strip provider prefix)
        raw_model = resolved_model.split("/", 1)[-1] if "/" in resolved_model else resolved_model
        pricing = self._CUSTOM_PRICING.get(raw_model)
        if pricing:
            return (in_tokens * pricing["input"] + out_tokens * pricing["output"]) / 1000
        return 0.0

    async def _call_with_retry(self, max_retries: int = 6, **kwargs):
        """Call LiteLLM with exponential backoff for rate limits / overload."""
        for attempt in range(max_retries + 1):
            try:
                return await litellm.acompletion(**kwargs)
            except Exception as e:
                err_str = str(e).lower()
                is_retryable = (
                    "high traffic" in err_str or "overload" in err_str
                    or "rate" in err_str or "529" in err_str or "429" in err_str
                    or "high load" in err_str or "server error" in err_str
                )
                if is_retryable and attempt < max_retries:
                    wait = min(2 ** attempt, 30)  # 1, 2, 4, 8, 16, 30 seconds
                    print(f"[RETRY] attempt {attempt+1}/{max_retries}, waiting {wait}s: {str(e)[:100]}", flush=True)
                    await asyncio.sleep(wait)
                    continue
                raise

    async def call(
        self,
        prompt: str,
        model: str | None = None,
        system_prompt: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        resolved = self._resolve_model(model or self.default_model)
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # Top-tier reasoning models tend to write much longer responses than
        # the historical 4096-token default, which causes 2-3 wasted truncate-
        # and-retry passes (each one re-bills the input tokens). Floor the
        # starting budget per model class so the first attempt usually fits.
        def _starting_max_tokens(m: str, requested: int) -> int:
            ml = m.lower()
            # Pro / Opus / 5.5 — the verbose tier
            if (
                "opus" in ml
                or ml.startswith("gpt-5.5")
                or ml.startswith("gpt-5.4-pro")
                or "claude-opus" in ml
                or ml == "grok-4"
                or ml == "xai/grok-4"
            ):
                return max(requested, 12288)
            # Mid tier — Sonnet, GPT-5.4 — moderately verbose
            if "sonnet" in ml or ml.startswith("gpt-5.4") or "gemini-2.5-pro" in ml:
                return max(requested, 6144)
            return requested

        current_max = _starting_max_tokens(resolved, max_tokens)
        total_cost = 0.0
        total_in = 0
        total_out = 0
        t0 = time.monotonic()

        # Some newer models reject custom temperature values:
        #   - claude-opus-4-7+ : "temperature is deprecated for this model"
        #   - gpt-5.x          : "temperature does not support 0.7 ... only the
        #                          default (1) is supported"
        # Skip the param for those so the request doesn't 400.
        def _supports_temperature(m: str) -> bool:
            if m.startswith("claude-opus-4-") and m >= "claude-opus-4-7":
                return False
            if m.startswith("gpt-5"):
                return False
            return True

        # Adaptive token loop: if output is truncated, double max_tokens and retry (up to 2x)
        for token_attempt in range(3):  # original + 2 doublings max
            kwargs = dict(
                model=resolved,
                messages=messages,
                max_tokens=current_max,
            )
            if _supports_temperature(resolved):
                kwargs["temperature"] = temperature
            if self._compat:
                kwargs["api_base"] = self._compat["api_base"]
                kwargs["api_key"] = self.api_key

            try:
                response = await self._call_with_retry(**kwargs)
            except Exception as e:
                # Defensive fallback: if a model rejects temperature for any
                # reason (deprecated, unsupported value, etc.), drop it and
                # retry once.
                err_lower = str(e).lower()
                rejects_temp = (
                    "temperature" in err_lower
                    and (
                        "deprecated" in err_lower
                        or "does not support" in err_lower
                        or "unsupported" in err_lower
                    )
                    and "temperature" in kwargs
                )
                if rejects_temp:
                    print(f"[FALLBACK] Dropping temperature for {resolved} and retrying", flush=True)
                    kwargs.pop("temperature", None)
                    response = await self._call_with_retry(**kwargs)
                else:
                    raise

            usage = response.usage or {}
            content = response.choices[0].message.content or ""
            in_tokens = getattr(usage, "prompt_tokens", 0)
            out_tokens = getattr(usage, "completion_tokens", 0)
            total_cost += self._estimate_cost(resolved, in_tokens, out_tokens, response)
            total_in += in_tokens
            total_out += out_tokens

            # Check if output was truncated (finish_reason == "length")
            finish_reason = getattr(response.choices[0], "finish_reason", "stop")
            if finish_reason == "length" and token_attempt < 2:
                new_max = min(current_max * 2, 65536)  # cap at 64K
                print(f"[ADAPTIVE] Output truncated at {current_max} tokens, retrying with {new_max}", flush=True)
                current_max = new_max
                continue

            break

        elapsed = time.monotonic() - t0

        return LLMResponse(
            content=content,
            model=resolved,
            input_tokens=total_in,
            output_tokens=total_out,
            cost_usd=total_cost,
            elapsed_s=elapsed,
        )

    async def call_with_search(
        self,
        prompt: str,
        model: str | None = None,
        system_prompt: str | None = None,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Call with web search. For providers with built-in search, uses their native
        grounding. For others, falls back to regular call (search should be done externally)."""
        resolved = self._resolve_model(model or self.default_model)

        if provider_has_search(self.provider):
            # Providers like Gemini have built-in search tools. LiteLLM handles
            # the tool routing automatically.
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            t0 = time.monotonic()

            tools = None
            if "gemini" in resolved.lower():
                # Gemini search tool naming changed:
                #   - Gemini 1.5 / 2.x        : `google_search_retrieval`  (legacy)
                #   - Gemini 2.5 / 3.x preview: `google_search`            (current)
                # The 3.x preview API rejects the legacy form with
                # `INVALID_ARGUMENT: google_search_retrieval is not supported.
                #  Please use google_search tool instead.`
                # Pick the right one based on the resolved model id.
                ml = resolved.lower()
                use_new_tool = (
                    "gemini-3" in ml
                    or "gemini-2.5" in ml
                )
                tools = [{"google_search": {}}] if use_new_tool else [{"googleSearchRetrieval": {}}]
            # OpenAI's web_search_preview is only available on the Responses
            # API (/v1/responses), not Chat Completions. PROVIDERS_WITH_SEARCH
            # excludes openai for that reason — search routes through Tavily.

            kwargs = dict(
                model=resolved,
                messages=messages,
                max_tokens=max_tokens,
            )
            if tools:
                kwargs["tools"] = tools
            if self._compat:
                kwargs["api_base"] = self._compat["api_base"]
                kwargs["api_key"] = self.api_key

            response = await self._call_with_retry(**kwargs)
            elapsed = time.monotonic() - t0

            usage = response.usage or {}
            content = response.choices[0].message.content or ""
            in_tokens = getattr(usage, "prompt_tokens", 0)
            out_tokens = getattr(usage, "completion_tokens", 0)
            cost = self._estimate_cost(resolved, in_tokens, out_tokens, response)

            return LLMResponse(
                content=content,
                model=resolved,
                input_tokens=in_tokens,
                output_tokens=out_tokens,
                cost_usd=cost,
                elapsed_s=elapsed,
            )
        else:
            # No built-in search — just do a regular call
            # Caller should use SearchProvider externally and inject results into prompt
            return await self.call(prompt, model, system_prompt, max_tokens)
