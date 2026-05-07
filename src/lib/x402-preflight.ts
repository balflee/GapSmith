/**
 * x402 preflight: verify upstream LLM (and optionally Tavily search) is
 * reachable BEFORE advertising 402 Payment Required on a Compute API
 * endpoint.
 *
 * The point is to refuse the agent's $15-25 USDC payment if our upstream
 * is currently down (Gemini 503, MiniMax 529, Anthropic Overloaded, etc.)
 * — a 1-token health ping costs ~$0.0001, vs the manual on-chain refund
 * cost when an agent pays for a job we can't fulfill.
 *
 * Cache: in-memory Map keyed by (provider, model, api-key-hash) with a
 * 30s TTL. Short enough that an outage that started mid-cache is felt
 * by the next agent within 30s; long enough that a single agent's 402
 * → settle round-trip won't trigger two engine pings.
 *
 * NOT applied to Data API endpoints (Scout gaps, pain-clusters, etc.) —
 * those are pure DB reads and don't depend on LLM/search health.
 */

import { createHash } from "crypto";

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8000";
const CACHE_TTL_MS = 30_000;

export interface PreflightResult {
  ok: boolean;
  llmOk: boolean;
  searchOk: boolean | null;
  llmLatencyMs: number;
  /** "upstream" → provider 5xx/rate-limit (agent should retry later).
   *  "config" → bad key / wrong model name (agent should fix config). */
  errorClass?: "upstream" | "config";
  error?: string;
  cachedAt: number;
}

interface PreflightInput {
  provider: string;
  model: string;
  apiKey: string;
  checkSearch?: boolean;
}

const cache = new Map<string, PreflightResult>();

function cacheKey(input: PreflightInput): string {
  // Hash the API key so we don't keep raw secrets in process memory longer
  // than needed. Slicing first 16 chars is plenty for collision resistance
  // within a single deployed process.
  const keyHash = createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16);
  return `${input.provider}::${input.model}::${keyHash}::${input.checkSearch ? 1 : 0}`;
}

/**
 * Run preflight check, returning a cached result if fresh (< 30s).
 *
 * Network failures talking to the engine are treated as `ok=false` with
 * errorClass="upstream" — caller should return 503 + Retry-After. We
 * never throw out of this function so the route handler never has to
 * try/catch around it.
 */
export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const result: PreflightResult = await pingEngine(input);
  cache.set(key, result);
  return result;
}

/** Force-refresh: skip cache. Useful after a confirmed upstream failure. */
export async function invalidatePreflight(input: PreflightInput): Promise<void> {
  cache.delete(cacheKey(input));
}

async function pingEngine(input: PreflightInput): Promise<PreflightResult> {
  const startedAt = Date.now();
  try {
    // Engine has its own internal timeout via litellm; we cap the round-trip
    // at 8s so a hanging upstream doesn't block the 402 advertisement
    // longer than the agent would tolerate.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const resp = await fetch(`${ENGINE_URL}/api/engine/health/llm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: input.provider,
        model: input.model,
        api_key: input.apiKey,
        check_search: input.checkSearch ?? true,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      return {
        ok: false,
        llmOk: false,
        searchOk: null,
        llmLatencyMs: Date.now() - startedAt,
        errorClass: "upstream",
        error: `engine /health/llm returned ${resp.status}`,
        cachedAt: Date.now(),
      };
    }
    const data = await resp.json();
    return {
      ok: Boolean(data.ok),
      llmOk: Boolean(data.llm_ok),
      searchOk: data.search_ok ?? null,
      llmLatencyMs: Number(data.llm_latency_ms) || 0,
      errorClass: data.error_class as "upstream" | "config" | undefined,
      error: data.error || undefined,
      cachedAt: Date.now(),
    };
  } catch (err) {
    // Network error talking to engine is itself an upstream-class fault —
    // we can't tell if Gemini is down or our engine is down, but either
    // way the agent shouldn't pay until it clears.
    return {
      ok: false,
      llmOk: false,
      searchOk: null,
      llmLatencyMs: Date.now() - startedAt,
      errorClass: "upstream",
      error: `engine unreachable: ${(err as Error).message}`,
      cachedAt: Date.now(),
    };
  }
}
