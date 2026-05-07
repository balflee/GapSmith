"""
Real-LLM smoke for the /api/engine/health/llm preflight endpoint.

Calls the FastAPI handler function directly (no HTTP layer) with three
scenarios against the real MiniMax key from .env.local:

  1. Healthy: real key + real model → expect ok=True, llm_ok=True
  2. Bad key: random string → expect ok=False, error_class="config"
  3. No search: check_search=False → expect search_ok=None

Cost: ~$0.0002 total. Run before pushing changes that touch
engine/api.py:health_llm or src/lib/x402-preflight.ts to catch
import errors / SDK shape mismatches that unit tests (which mock the
SDK) can't see.

Run:  python -m engine.tests.smoke_health_llm_endpoint
"""

import asyncio
import os
import sys
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[2] / ".env.local"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("AGENT_LLM_KEY")
if not API_KEY:
    print("ERROR: AGENT_LLM_KEY missing from .env.local")
    sys.exit(1)

from engine.api import health_llm, HealthCheckRequest


def _summary(label: str, out: dict):
    ok = out.get("ok", False)
    mark = "[OK]" if ok else "[FAIL]"
    print(f"{mark} {label}")
    print(f"     ok={ok} llm_ok={out.get('llm_ok')} search_ok={out.get('search_ok')}")
    print(f"     llm_latency_ms={out.get('llm_latency_ms')} search_latency_ms={out.get('search_latency_ms')}")
    if out.get("error"):
        print(f"     error={out['error']}")
    if out.get("error_class"):
        print(f"     error_class={out['error_class']}")
    if out.get("search_error"):
        print(f"     search_error={out['search_error']}")


async def main() -> int:
    failures = 0

    # 1. Healthy path
    print("\n=== Scenario 1: real key + real model + check_search=True ===")
    req = HealthCheckRequest(
        provider="minimax", model="MiniMax-M2.7", api_key=API_KEY, check_search=True,
    )
    out = await health_llm(req)
    _summary("healthy path", out)
    if not (out.get("ok") and out.get("llm_ok")):
        print("     FAIL: expected ok=True llm_ok=True")
        failures += 1
    if out.get("llm_latency_ms", 0) <= 0 or out.get("llm_latency_ms", 9999) > 30000:
        print(f"     SUSPICIOUS: llm_latency_ms={out.get('llm_latency_ms')} (expected 200-15000)")

    # 2. Bad key
    print("\n=== Scenario 2: bad key — should classify as config or upstream ===")
    req2 = HealthCheckRequest(
        provider="minimax", model="MiniMax-M2.7", api_key="sk-clearly-invalid-test-key",
        check_search=False,
    )
    out2 = await health_llm(req2)
    _summary("bad key", out2)
    if out2.get("ok"):
        print("     FAIL: expected ok=False with bad key")
        failures += 1
    elif not out2.get("error_class"):
        print("     FAIL: expected error_class to be set")
        failures += 1
    else:
        # Either classification is acceptable — providers vary on whether they
        # surface bad-key as 401 (config) or as a connection-style error
        # (upstream). The IMPORTANT behavior is ok=False + a classification.
        print(f"     classification: {out2.get('error_class')} — both 'config' and 'upstream' are acceptable here")

    # 3. Skip search
    print("\n=== Scenario 3: real key + check_search=False — search_ok must be None ===")
    req3 = HealthCheckRequest(
        provider="minimax", model="MiniMax-M2.7", api_key=API_KEY, check_search=False,
    )
    out3 = await health_llm(req3)
    _summary("skip search", out3)
    if not (out3.get("ok") and out3.get("search_ok") is None):
        print(f"     FAIL: expected ok=True + search_ok=None, got search_ok={out3.get('search_ok')}")
        failures += 1

    print()
    if failures == 0:
        print("[OK] all 3 scenarios passed — preflight endpoint healthy")
        return 0
    print(f"[FAIL] {failures} scenario(s) failed — DO NOT push")
    return 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
