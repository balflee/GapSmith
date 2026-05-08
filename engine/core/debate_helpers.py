"""
Debate LLM helpers — system-prompt-aware wrappers around providers.llm.

Provides:
- _call_llm_with_search: Tavily-augmented LLM call with optional system_prompt
- _call_with_gate: quality-gated call with validator + retry
- _call_sub_agent: lightweight search-focused sub-agent invocation
- parse_vote: robust JSON vote extraction from agent output

Mirrors patterns from pipeline/debate_agents.py but adapted for LiteLLM + Tavily.
"""

from __future__ import annotations

import json
import re

from engine.core.providers import LLMProvider, Providers, LLMResponse, provider_has_search

MAX_GATE_RETRIES = 1
SEARCHES_PER_CALL = 3


# ============================================================
# Search query extraction (domain-aware)
# ============================================================

def _clean_domain(text: str, max_len: int = 60) -> str:
    """Strip markdown / version / status noise from extracted domain text.

    Without this, regex-extracted domains carry literal noise that
    Tavily can't parse usefully. Examples from real debates:

    "# APAC L&D Simulation 平台 — 概念文档 v0.4" → "APAC L&D Simulation 平台"
    "## My Idea [DRAFT]"                       → "My Idea"
    "**AgentMeter — v2.1**"                    → "AgentMeter"

    The full noisy form gets templated into queries like "{domain} SaaS
    pricing plans" and Tavily falls back to generic SaaS catnip results.
    """
    if not text:
        return ""
    # Strip leading markdown / heading / quote / list chars iteratively
    # (handles "## ", "**", "> ", "- ", combinations, leading whitespace)
    while text and text[0] in '#*>-`~ \t​':
        text = text[1:]
    # Strip Chinese version-doc suffix (— 概念文档 v0.4)
    text = re.sub(r'\s*[—–\-]\s*概念文档\s*v?\d+(\.\d+)*\s*$', '', text)
    # Strip English version suffix (— v0.4, -- version 3)
    text = re.sub(r'\s*[—–\-]+\s*(?:version\s+|v)\d+(\.\d+)*\s*$', '', text, flags=re.IGNORECASE)
    # Strip bracketed status ([DRAFT], [WIP], [v0.4])
    text = re.sub(r'\s*\[(?:draft|wip|v\d+(\.\d+)*)\]\s*$', '', text, flags=re.IGNORECASE)
    # Strip trailing markdown emphasis (** at end)
    text = re.sub(r'\*+\s*$', '', text)
    # Strip trailing ellipsis — single unicode … OR 3+ ASCII dots
    text = re.sub(r'(?:…|\.{3,})\s*$', '', text)
    # Collapse internal whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:max_len]


async def llm_generate_queries(
    providers,
    prompt: str,
    max_queries: int = SEARCHES_PER_CALL,
) -> list[str]:
    """Use the LLM to generate targeted search queries from prompt context.

    Beats the template-based extract_search_queries on niche / non-English /
    structured-input prompts because the LLM reads the actual agent intent
    (e.g. "I need to verify Mursion's 2023 layoffs") instead of regex-matching
    a noisy markdown title. Costs ~$0.001-0.002 per call (MiniMax-M2.7),
    called once per call_llm_with_search invocation.

    Returns [] on any failure — caller falls back to extract_search_queries.
    """
    # Cap input — the LLM only needs the gist, not the full multi-page prompt.
    # Most agent prompts have the most-relevant intent in the first 2-3K chars
    # (the task framing, the plan being challenged, the question being asked).
    excerpt = prompt[:2500]
    instruction = f"""Generate exactly {max_queries} web search queries for this AI agent task.

GOAL: queries that return SPECIFIC, EVIDENCE-RICH results — competitor pricing pages, annual reports, named failure post-mortems, regulatory documents, specific company URLs, primary sources.

AVOID generic queries like "X SaaS pricing plans", "X tools comparison", "X startup 2025" — those return blog spam.

PREFER:
- Specific company names ("BTS Group annual report APAC revenue 2023")
- Regulatory bodies + frameworks ("MAS TRM individual accountability framework")
- Named failure cases ("Mursion VR layoffs 2023 post-mortem")
- Concrete pricing lookups ("Capsim corporate per-learner pricing")

Output rules:
- English only (search engines return better mix that way)
- 6-15 words per query
- Output exactly {max_queries} queries, one per line
- No numbering, no quotes, no commentary, no markdown

AGENT TASK CONTEXT:
{excerpt}"""
    try:
        resp = await providers.llm.call(
            prompt=instruction,
            model=providers.model,
            # 1200 tokens to land in 1 round-trip across both Prove and
            # Forge prompts — MiniMax CoT preamble eats 400-1000 tokens
            # before the actual 3-query output; smaller budgets triggered
            # LiteLLMProvider's adaptive retry doubling, adding latency
            # to every search call.
            max_tokens=1200,
        )
        text = (resp.content or "").strip()
        lines: list[str] = []
        for raw in text.splitlines():
            line = raw.strip()
            # Strip numbering, bullets, leading quotes
            line = re.sub(r'^[\d\.\)\-\*\•\s"\'`]+', '', line).strip()
            line = line.rstrip('"\'`').strip()
            # Skip commentary, empty lines, markdown headers, too-short fragments
            if not line or len(line) < 8 or len(line) > 200:
                continue
            if line.startswith('#'):
                continue
            lower = line.lower()
            if lower.startswith(('here', 'these', 'i ', 'note', 'output', 'queries:', 'query:')):
                continue
            lines.append(line)
        if lines:
            print(f"[QUERY GEN LLM] generated {len(lines)} queries", flush=True)
            return lines[:max_queries]
        print(f"[QUERY GEN LLM] no parseable queries, falling back to template", flush=True)
    except Exception as e:
        print(f"[QUERY GEN LLM] failed, falling back to template: {type(e).__name__}: {str(e)[:120]}", flush=True)
    return []


def extract_search_queries(prompt: str, max_queries: int = SEARCHES_PER_CALL) -> list[str]:
    """Build targeted search queries from prompt context to ground the LLM.

    Template-based fallback used when llm_generate_queries fails. Less
    accurate than the LLM path because it relies on regex-matching a
    domain phrase out of the prompt and then string-templating it into
    canned query shells — but cheap, deterministic, no extra API call.
    """
    queries: list[str] = []

    # Extract domain/subject — patterns ordered most→least specific.
    # Includes both Forge/Ideation formats AND Prove/Debate formats.
    domain = ""
    for pattern in [
        # Forge/Ideation guided-form headers
        r"## Market / Industry\n(.+?)(?:\n|$)",
        r"## Target Audience\n(.+?)(?:\n|$)",
        r"## Pain Points.*?\n(.+?)(?:\n|$)",
        # Prove/Debate main agents: `--- IDEA / INPUT ---\n{idea}\n--- END INPUT ---`
        r"---\s*IDEA\s*/\s*INPUT\s*---\s*\n(.+?)(?:\n---|\n\n)",
        # Prove/Debate sub-agents: bare `Idea: {idea}` at start of line (with or without #)
        r"(?:^|\n)#{0,3}\s*Idea\s*[:：]\s*(.+?)(?:\n|$)",
        # Prove Proposer original plan blocks: `--- PROPOSER OUTPUT ---\n{content}`
        r"---\s*PROPOSER\s+(?:PLAN|OUTPUT|ORIGINAL\s+PLAN)\s*---\s*\n(.+?)(?:\n---|\n\n)",
        # JSON forms
        r'"title":\s*"([^"]{10,80})',
        r'"idea":\s*"([^"]{10,120})',
    ]:
        m = re.search(pattern, prompt, re.IGNORECASE | re.DOTALL)
        if m:
            domain = _clean_domain(m.group(1).strip()[:80])
            if domain:
                break

    if not domain:
        # Forge CONTEXT marker fallback
        m = re.search(r"CONTEXT[^\n]*\n+(?:##[^\n]*\n)*([^\n#{\"]{10,100})", prompt)
        if m:
            domain = _clean_domain(m.group(1).strip()[:80])

    if not domain:
        # Last resort: first substantive line after any markdown heading
        m = re.search(r"(?:^|\n)(?:#{1,3}\s+[^\n]+\n+)?([A-Z][^\n]{15,100})", prompt)
        if m:
            domain = _clean_domain(m.group(1).strip()[:80])

    if not domain:
        return []

    prompt_lower = prompt.lower()

    # Route to phase-appropriate queries
    if "competitor" in prompt_lower or "competitive landscape" in prompt_lower:
        queries = [
            f"{domain} tools solutions comparison 2025 2026",
            f"{domain} SaaS pricing plans",
            f"{domain} alternatives best tools review",
        ]
    elif "pricing" in prompt_lower or "benchmark" in prompt_lower or "cost structure" in prompt_lower:
        queries = [
            f"{domain} competitor pricing page",
            f"{domain} SaaS pricing 2025",
            f"{domain} cost structure startup",
        ]
    elif "pivot" in prompt_lower or "failure" in prompt_lower or "post-mortem" in prompt_lower:
        queries = [
            f"{domain} startup failure post-mortem",
            f"{domain} shutdown pivot case study",
            f"{domain} why startups fail",
        ]
    elif "trend" in prompt_lower or "market signal" in prompt_lower:
        queries = [
            f"{domain} market trends 2025 2026",
            f"{domain} industry growth statistics",
            f"{domain} emerging signals",
        ]
    elif "contrarian" in prompt_lower or "alternative approach" in prompt_lower:
        queries = [
            f"{domain} alternative approaches different angle",
            f"{domain} unconventional solutions",
        ]
    elif "evidence" in prompt_lower or "verify" in prompt_lower:
        queries = [
            f"{domain} user feedback review 2025",
            f"{domain} real case study data",
        ]
    elif "reverse" in prompt_lower or "assumption" in prompt_lower:
        queries = [
            f"{domain} assumption wrong counter-evidence",
            f"{domain} market misconception data",
        ]
    else:
        queries = [
            f"{domain} market analysis 2025 2026",
            f"{domain} competitors pricing review",
        ]

    return queries[:max_queries]


# ============================================================
# Search-augmented LLM call (with system_prompt support)
# ============================================================

async def call_llm_with_search(
    providers: Providers,
    prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 4096,
) -> LLMResponse:
    """
    Call LLM with web search augmentation.
    - Native search providers (Gemini, OpenAI, Qwen): call_with_search()
    - Tavily fallback: run queries, inject results into prompt, then plain call()
    - No search available: plain call()
    """
    model = providers.model
    llm_provider = getattr(providers.llm, "provider", "")

    if provider_has_search(llm_provider):
        # Providers with native web search
        if hasattr(providers.llm, "call_with_search"):
            try:
                return await providers.llm.call_with_search(
                    prompt=prompt,
                    model=model,
                    system_prompt=system_prompt,
                    max_tokens=max_tokens,
                )
            except TypeError:
                # older signature without system_prompt
                return await providers.llm.call_with_search(prompt=prompt, model=model, max_tokens=max_tokens)

    if providers.search:
        # LLM-generated queries beat templated ones on niche / non-English /
        # structured-input prompts (e.g. multi-page markdown ideas, Chinese
        # domain names, regulator-specific lookups). Falls back to template
        # if the meta-LLM call fails. ~$0.001-0.002 per call.
        queries = await llm_generate_queries(providers, prompt)
        if not queries:
            queries = extract_search_queries(prompt)
        search_context = ""

        if queries:
            all_results = []
            for query in queries:
                try:
                    results = await providers.search.search(query, num_results=3)
                    for r in results:
                        all_results.append(f"- **{r.title}** ({r.url})\n  {r.snippet}")
                except Exception as e:
                    print(f"[DEBATE SEARCH ERROR] query='{query}': {e}", flush=True)

            if all_results:
                search_context = (
                    "\n\n--- WEB SEARCH RESULTS (use these as evidence, cite URLs with [REF: SEARCH]) ---\n"
                    + "\n".join(all_results[:12])
                    + "\n--- END SEARCH RESULTS ---\n\n"
                )

        augmented = prompt + search_context
        return await providers.llm.call(
            prompt=augmented,
            model=model,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
        )

    # No search available — plain call
    return await providers.llm.call(
        prompt=prompt,
        model=model,
        system_prompt=system_prompt,
        max_tokens=max_tokens,
    )


# ============================================================
# Quality-gated call
# ============================================================

async def call_with_gate(
    providers: Providers,
    prompt: str,
    validator,
    system_prompt: str | None = None,
    max_tokens: int = 4096,
    use_search: bool = True,
    max_gate_retries: int = MAX_GATE_RETRIES,
    min_length: int = 0,
) -> LLMResponse:
    """
    Call LLM, run validator(content), retry with feedback if gate fails.
    If min_length > 0, also treats short outputs as gate failures.
    Final failure: prepend [QUALITY_WARNING: ...] to content.
    """
    def _run_gate(content: str) -> tuple[bool, str]:
        """Combined length + validator check."""
        passed, feedback = validator(content)
        if min_length > 0 and len(content) < min_length:
            length_msg = f"Response too short ({len(content)} chars, need ≥{min_length})."
            if passed:
                return False, length_msg
            return False, f"{length_msg} {feedback}"
        return passed, feedback

    if use_search:
        response = await call_llm_with_search(providers, prompt, system_prompt=system_prompt, max_tokens=max_tokens)
    else:
        response = await providers.llm.call(
            prompt=prompt, model=providers.model,
            system_prompt=system_prompt, max_tokens=max_tokens,
        )

    passed, feedback = _run_gate(response.content)
    if passed:
        return response

    for _ in range(max_gate_retries):
        # If the gate is about missing citations, extract upstream URLs and re-inject
        available_urls = _extract_urls_from_text(prompt)
        url_reminder = ""
        if available_urls and ("citation" in feedback.lower() or "URL" in feedback or "source" in feedback.lower()):
            url_reminder = (
                "\n\n**Sources already in the prompt above — you MUST inline at least some of these:**\n"
                + "\n".join(f"- {u}" for u in available_urls[:12])
            )

        retry_prompt = (
            f"{prompt}\n\nWARNING: Your previous output failed the quality check:\n"
            f"{feedback}{url_reminder}\n\nPlease add the missing items and output the complete content again."
        )
        if use_search:
            response = await call_llm_with_search(providers, retry_prompt, system_prompt=system_prompt, max_tokens=max_tokens)
        else:
            response = await providers.llm.call(
                prompt=retry_prompt, model=providers.model,
                system_prompt=system_prompt, max_tokens=max_tokens,
            )
        passed, feedback = _run_gate(response.content)
        if passed:
            return response

    response.content = f"[QUALITY_WARNING: {feedback}]\n\n{response.content}"
    return response


# ============================================================
# Sub-agent invocation (lightweight, search-focused)
# ============================================================

MIN_SUB_AGENT_LEN = 600  # sub-agent prompts request multi-section reports; 300-char outputs are lazy/truncated
MIN_MAIN_AGENT_LEN = 1500  # Proposer/Defender prompts demand 5-7 sections with evidence; <1500 = lazy


def _extract_urls_from_text(text: str, limit: int = 25) -> list[str]:
    """Extract unique URLs (in order) from a text block. Used to re-inject sources in retry prompts."""
    import re
    urls = re.findall(r"https?://[^\s)\]\"']+", text)
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        u = u.rstrip(".,;:")  # strip trailing punctuation
        if u not in seen:
            seen.add(u)
            out.append(u)
            if len(out) >= limit:
                break
    return out


async def call_main_agent_with_length_guard(
    providers: Providers,
    prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 4096,
    min_length: int = MIN_MAIN_AGENT_LEN,
    use_search: bool = True,
) -> LLMResponse:
    """
    Call a main agent and retry once if the output is lazy/truncated.
    Main agent prompts demand multi-section markdown with evidence — short
    responses (<1500 chars) indicate the LLM went lazy.
    """
    if use_search:
        resp = await call_llm_with_search(providers, prompt, system_prompt=system_prompt, max_tokens=max_tokens)
    else:
        resp = await providers.llm.call(prompt=prompt, model=providers.model, system_prompt=system_prompt, max_tokens=max_tokens)

    content = (resp.content or "").strip()
    if len(content) >= min_length:
        return resp

    print(f"[MAIN-AGENT WARN] short response ({len(content)} chars < {min_length}), retrying with kick...", flush=True)
    retry_prompt = (
        prompt
        + "\n\n---\n\n⚠️ Your previous attempt was only a few hundred characters — clearly too brief for "
        "the analysis this prompt demands. Please actually produce the full multi-section response with "
        "evidence, URLs, and concrete details. The output should be at least 1500-3000 words of substantive "
        "markdown. If you genuinely have no evidence for a sub-point, label it `[unverified]` and move on — "
        "do not skip entire sections."
    )
    if use_search:
        retry = await call_llm_with_search(providers, retry_prompt, system_prompt=system_prompt, max_tokens=max_tokens)
    else:
        retry = await providers.llm.call(prompt=retry_prompt, model=providers.model, system_prompt=system_prompt, max_tokens=max_tokens)

    retry_content = (retry.content or "").strip()
    if len(retry_content) >= min_length:
        return retry

    print(f"[MAIN-AGENT FAIL] retry also short ({len(retry_content)} chars). Returning best effort.", flush=True)
    # Return whichever is longer so we don't lose content
    return retry if len(retry_content) > len(content) else resp


async def call_sub_agent(
    providers: Providers,
    prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 2048,
    validator=None,
    min_length: int = MIN_SUB_AGENT_LEN,
) -> LLMResponse:
    """
    Lightweight call for sub-agent tasks (Trend Scout, Contrarian, Gap Finder,
    Benchmark Hunter, Evidence Hunter). Always uses search if available.

    Retries once if: response is too short, OR optional validator fails (e.g.,
    citation-count gate). Retry prompt includes extracted URLs from upstream
    context to nudge the LLM into proper inline citation.
    """
    resp = await call_llm_with_search(
        providers, prompt, system_prompt=system_prompt, max_tokens=max_tokens,
    )
    content = (resp.content or "").strip()

    length_ok = len(content) >= min_length
    gate_ok, gate_feedback = (True, "")
    if validator:
        gate_ok, gate_feedback = validator(content)

    if length_ok and gate_ok:
        return resp

    reasons: list[str] = []
    if not length_ok:
        reasons.append(f"Response was only {len(content)} chars — far too brief for the multi-section report requested.")
    if not gate_ok and gate_feedback:
        reasons.append(gate_feedback)

    # Build citation-aware kick: extract URLs already present in the prompt (upstream context)
    available_urls = _extract_urls_from_text(prompt)
    url_reminder = ""
    if available_urls and (not gate_ok):
        url_reminder = (
            "\n\n**Sources already available in the prompt above — you MUST inline at least some of these:**\n"
            + "\n".join(f"- {u}" for u in available_urls[:12])
        )

    print(f"[SUB-AGENT RETRY] length_ok={length_ok} gate_ok={gate_ok} reasons={len(reasons)}", flush=True)

    retry_prompt = (
        prompt
        + "\n\n---\n\n⚠️ Your previous attempt failed quality checks:\n"
        + "\n".join(f"- {r}" for r in reasons)
        + url_reminder
        + "\n\nProduce a complete response addressing every requirement. Every substantive claim "
        "must have an inline citation (`[REF: SEARCH] URL` or bare URL). If a claim is unverified, "
        "label `[unverified]` rather than dropping the citation."
    )
    retry = await call_llm_with_search(
        providers, retry_prompt, system_prompt=system_prompt, max_tokens=max_tokens,
    )
    retry_content = (retry.content or "").strip()
    retry_length_ok = len(retry_content) >= min_length
    retry_gate_ok = True
    if validator:
        retry_gate_ok, _ = validator(retry_content)

    if retry_length_ok and retry_gate_ok:
        return retry

    # Still failed after one retry — keep the longer body but DO NOT prepend a
    # warning marker into the content. The marker was leaking into the
    # user-visible debate transcript and into downstream prompts (where it
    # confused the LLM more than it helped). The [SUB-AGENT FAIL] print above
    # remains as the diagnostic signal for ops; quality is now judged by the
    # downstream agents from the content itself.
    print(f"[SUB-AGENT FAIL] retry also failed (length_ok={retry_length_ok} gate_ok={retry_gate_ok})", flush=True)
    body = retry_content if len(retry_content) > len(content) else content
    retry.content = body or "(no usable content from sub-agent)"
    return retry


# ============================================================
# Vote parsing (robust: direct JSON → markdown block → regex)
# ============================================================

def parse_vote(raw_output: str, agent_name: str = "") -> dict | None:
    """
    Parse a voter's output into {"vote", "reason", "conditions"}.
    Attempts: direct JSON, JSON block in markdown, regex extraction.
    Returns None if all fail.
    """
    # Strategy 1: direct JSON
    try:
        data = json.loads(raw_output)
        if _validate_vote(data):
            return _normalize_vote(data)
    except (json.JSONDecodeError, TypeError):
        pass

    # Strategy 2: JSON block in markdown
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_output, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(1))
            if _validate_vote(data):
                return _normalize_vote(data)
        except (json.JSONDecodeError, TypeError):
            pass

    # Strategy 2b: any {...} block with "vote" key
    m = re.search(r'\{[^{}]*"vote"\s*:[^{}]*\}', raw_output, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            if _validate_vote(data):
                return _normalize_vote(data)
        except (json.JSONDecodeError, TypeError):
            pass

    # Strategy 3: regex extraction
    vote_match = re.search(r'["\']?vote["\']?\s*[:：]\s*["\']?(PROCEED|CONDITIONAL|REJECT|HOLD)["\']?', raw_output, re.IGNORECASE)
    reason_match = re.search(r'["\']?reason["\']?\s*[:：]\s*["\']([^"\'\n]{5,500})', raw_output, re.IGNORECASE)
    if vote_match:
        return {
            "vote": vote_match.group(1).upper(),
            "reason": (reason_match.group(1) if reason_match else "").strip(),
            "conditions": [],
        }

    return None


def _validate_vote(data) -> bool:
    if not isinstance(data, dict):
        return False
    vote = data.get("vote", "").upper() if isinstance(data.get("vote"), str) else ""
    if vote not in {"PROCEED", "CONDITIONAL", "REJECT", "HOLD"}:
        return False
    return True


def _normalize_vote(data: dict) -> dict:
    return {
        "vote": data["vote"].upper(),
        "reason": str(data.get("reason", "")).strip(),
        "conditions": list(data.get("conditions", [])) if isinstance(data.get("conditions"), list) else [],
    }


async def collect_vote(
    providers: Providers,
    prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 1024,
    max_retries: int = 2,
) -> tuple[dict, LLMResponse]:
    """
    Call LLM for vote, parse result, retry on parse failure.
    Returns (vote_dict, llm_response). Falls back to CONDITIONAL on total failure.
    """
    last_response = None
    for _ in range(max_retries + 1):
        response = await providers.llm.call(
            prompt=prompt, model=providers.model,
            system_prompt=system_prompt, max_tokens=max_tokens,
        )
        last_response = response
        parsed = parse_vote(response.content)
        if parsed:
            return parsed, response

    fallback = {
        "vote": "CONDITIONAL",
        "reason": "[AUTO] vote parse failed — defaulting to CONDITIONAL",
        "conditions": ["agent_output_error"],
    }
    return fallback, last_response
