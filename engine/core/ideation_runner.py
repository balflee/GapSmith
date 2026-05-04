"""
Ideation Runner (Forge) — full parity with CLI pipeline.
Round 1: 4-step gated pain discovery (search + validate + competitive + solution design)
Rounds 2-5: Proposer + Defender with web search every round
Strategist: structured JSON output
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from engine.core.providers import LLMProvider, Providers, LLMResponse, provider_has_search
from engine.core.validators import validate_pain_discovery, validate_prevalence, validate_competitive, validate_solution_design

MAX_ROUNDS = 5
MAX_GATE_RETRIES = 1  # retry once if quality gate fails

# Number of Tavily searches to run per LLM call for non-search providers
SEARCHES_PER_CALL = 3

# Language enforcement suffix (matches CLI)
LANG_SUFFIX = "\n\n**IMPORTANT: Your entire response MUST be in English. Do not use Chinese or any other language.**"


# ============================================================
# Search-augmented LLM call
# ============================================================

def _extract_search_queries(prompt: str, max_queries: int = SEARCHES_PER_CALL) -> list[str]:
    """Build search queries from prompt context to ground LLM output in real data."""
    queries = []

    # 1. Extract the market/domain from context (order matters — most specific first)
    domain = ""
    for pattern in [
        r"## Market / Industry\n(.+?)(?:\n|$)",
        r"## Target Audience\n(.+?)(?:\n|$)",
        r"## Pain Points.*?\n(.+?)(?:\n|$)",
    ]:
        m = re.search(pattern, prompt, re.IGNORECASE)
        if m:
            domain = m.group(1).strip()[:80]
            break

    if not domain:
        # Try Scout topic title first (most concise)
        m = re.search(r'"title":\s*"([^"]{10,80})', prompt)
        if m:
            domain = m.group(1).strip()[:50]

    if not domain:
        # Try Scout brief overview — extract the subject noun phrase
        m = re.search(r'"overview":\s*"(?:The\s+)?([^"]{5,60}?)(?:\s+(?:is|are|has|was|were|market)\b)', prompt)
        if m:
            domain = m.group(1).strip()[:50]

    if not domain:
        # Fallback: first meaningful line after CONTEXT marker (skip JSON/Product Modes)
        m = re.search(r"CONTEXT[^\n]*\n+(?:##[^\n]*\n)*([^\n#{\"]{10,100})", prompt)
        if m:
            domain = m.group(1).strip()[:80]

    if not domain:
        return []

    # 2. Build targeted queries based on prompt phase
    prompt_lower = prompt.lower()

    if "step 1" in prompt_lower or "pain" in prompt_lower and "discovery" in prompt_lower:
        queries = [
            f"{domain} user complaints reddit 2025 2026",
            f"{domain} pain points frustrations",
            f"{domain} problems site:news.ycombinator.com",
        ]
    elif "step 2" in prompt_lower or "prevalence" in prompt_lower:
        queries = [
            f"{domain} common problems how many users affected",
            f"{domain} market demand survey statistics 2025 2026",
        ]
    elif "step 3" in prompt_lower or "competitive" in prompt_lower:
        queries = [
            f"{domain} tools solutions comparison 2025 2026",
            f"{domain} SaaS pricing plans",
            f"{domain} alternatives best tools review",
        ]
    elif "step 4" in prompt_lower or "solution design" in prompt_lower:
        queries = [
            f"{domain} white label provider API",
            f"{domain} startup funding 2025 2026",
        ]
    elif "from pain to solution" in prompt_lower or "round 2" in prompt_lower:
        queries = [
            f"{domain} competitor pricing review",
            f"{domain} user needs survey",
            f"{domain} startup solutions 2025 2026",
        ]
    elif "iterative" in prompt_lower:
        queries = [
            f"{domain} best tools comparison review 2025",
            f"how did {domain} startup get first 100 users",
        ]
    elif "final" in prompt_lower or "convergence" in prompt_lower:
        queries = [
            f"{domain} market size TAM 2025 2026",
            f"{domain} startup funding latest",
        ]
    else:
        queries = [
            f"{domain} pain points problems 2025 2026",
            f"{domain} tools solutions review",
        ]

    return queries[:max_queries]


async def _call_llm_with_search(
    providers: Providers, prompt: str, max_tokens: int = 4096,
) -> LLMResponse:
    """
    Call LLM with web search augmentation.
    - If provider has built-in search (Gemini, OpenAI, Qwen): use native search
    - If provider lacks search but Tavily is available: search first, inject results
    - If no search available: plain LLM call
    """
    model = providers.model

    if provider_has_search(providers.llm.provider if hasattr(providers.llm, 'provider') else ""):
        # Provider has built-in search — use it directly
        return await providers.llm.call_with_search(prompt=prompt, model=model, max_tokens=max_tokens)

    if providers.search:
        # External search via Tavily — search first, inject results
        queries = _extract_search_queries(prompt)
        search_context = ""

        if queries:
            all_results = []
            for query in queries:
                try:
                    results = await providers.search.search(query, num_results=3)
                    for r in results:
                        all_results.append(f"- **{r.title}** ({r.url})\n  {r.snippet}")
                except Exception as e:
                    print(f"[SEARCH ERROR] query='{query}': {e}", flush=True)

            if all_results:
                search_context = (
                    "\n\n--- WEB SEARCH RESULTS (use these as evidence, cite URLs) ---\n"
                    + "\n".join(all_results[:12])  # Cap at 12 results
                    + "\n--- END SEARCH RESULTS ---\n\n"
                )

        augmented_prompt = prompt + search_context
        return await providers.llm.call(prompt=augmented_prompt, model=model, max_tokens=max_tokens)

    # No search available — plain call
    return await providers.llm.call(prompt=prompt, model=model, max_tokens=max_tokens)


# ============================================================
# Quality gate: call LLM, validate output, retry if needed
# ============================================================

async def _call_with_gate(
    providers: Providers,
    prompt: str,
    validator,
    max_tokens: int = 4096,
    use_search: bool = True,
) -> LLMResponse:
    """
    Call LLM with quality gate validation. If gate fails, retry with feedback.
    After max retries, pass through with [QUALITY_WARNING] prefix.
    Matches CLI's call_with_gate() pattern.
    """
    call_fn = _call_llm_with_search if use_search else providers.llm.call

    if use_search:
        response = await _call_llm_with_search(providers, prompt=prompt, max_tokens=max_tokens)
    else:
        response = await providers.llm.call(prompt=prompt, model=providers.model, max_tokens=max_tokens)

    passed, feedback = validator(response.content)
    if passed:
        return response

    # Retry with validation feedback
    for attempt in range(MAX_GATE_RETRIES):
        retry_prompt = f"""{prompt}

WARNING: Your previous output failed the quality check:
{feedback}

Please add the missing items and output the complete content again."""

        if use_search:
            response = await _call_llm_with_search(providers, prompt=retry_prompt, max_tokens=max_tokens)
        else:
            response = await providers.llm.call(prompt=retry_prompt, model=providers.model, max_tokens=max_tokens)

        passed, feedback = validator(response.content)
        if passed:
            return response

    # All retries failed — pass through with warning
    response.content = f"[QUALITY_WARNING: {feedback}]\n\n{response.content}"
    return response


# ============================================================
# Round 1: Gated multi-step pain discovery (CLI parity)
# ============================================================

async def _run_gated_round1(
    context: str, providers: Providers, progress_fn, session_config: str = "",
) -> tuple[str, float, int, int]:
    """
    Proposer Round 1 split into 4 gated steps (matching CLI):
    1. Pain discovery with search
    2. Prevalence check with search
    3. Competitive landscape with search
    4. Solution design (creative phase)

    Returns: (combined_output, total_cost, total_in_tokens, total_out_tokens)
    """
    model = providers.model
    cost = 0.0
    in_tok = 0
    out_tok = 0

    # Step 1: Pain discovery
    await progress_fn("round1", "Round 1 Step 1/4: Pain point search...", 5)
    step1_prompt = f"""Round 1 / Step 1: Pain Point Discovery

You are a pain point hunter. Find REAL user pain points using web search.

--- CONTEXT ---
{context[:8000]}
--- END CONTEXT ---

Search methodology (by priority):
1. If context contains pain signals or pain points → use them as starting points
2. Use web search to find real user complaints:
   - "[domain] user complaints reddit"
   - "[domain] frustrations site:news.ycombinator.com"
   - "[specific tool] review negative"
   - "[domain] pain points twitter"
3. For each high-potential pain point, also search for orchestration layer opportunities:
   - "[industry/pain] white label provider"
   - "[industry] subscription revenue" OR "[industry] LTV"

Output requirements:
- At least 5 pain points, as a numbered list
- Each pain point MUST include:
  - Who is complaining?
  - What are they complaining about?
  - How are they currently coping? (workarounds)
  - Source reference [REF: SEARCH] with URL if found
- Do NOT fabricate pain points. No search results = pain point doesn't exist.

Reply with your complete pain point research.{LANG_SUFFIX}"""

    r1 = await _call_with_gate(providers, prompt=step1_prompt, validator=validate_pain_discovery, max_tokens=4096)
    cost += r1.cost_usd; in_tok += r1.input_tokens; out_tok += r1.output_tokens
    step1_output = r1.content

    # Step 2: Prevalence check
    await progress_fn("round1", "Round 1 Step 2/4: Prevalence validation...", 12)
    step2_prompt = f"""Round 1 / Step 2: Prevalence Validation

You found these pain points in Step 1:
{step1_output}

Now validate how widespread each pain point is.

For each pain point, search for:
- Related posts/issues interaction data (upvotes, comments, stars)
- "[pain keyword] how many people / common problem"
- Estimate frequency and mark:
  - HIGH: Multiple platforms with 100+ interactions, or mentioned in industry reports
  - MEDIUM: Single platform with 10-100 interactions
  - LOW: < 10 interactions, likely niche issue

Output: For each pain point, provide frequency marker + evidence.{LANG_SUFFIX}"""

    r2 = await _call_with_gate(providers, prompt=step2_prompt, validator=validate_prevalence, max_tokens=4096)
    cost += r2.cost_usd; in_tok += r2.input_tokens; out_tok += r2.output_tokens
    step2_output = r2.content

    # Step 3: Competitive landscape
    await progress_fn("round1", "Round 1 Step 3/4: Competitive landscape...", 20)
    step3_prompt = f"""Round 1 / Step 3: Competitive Landscape

Pain points with prevalence data:
{step2_output}

For each HIGH and MEDIUM frequency pain point, search existing solutions:
- Search "[pain keyword] solution / tool / SaaS / app"
- Search "[pain keyword] alternative to [existing tool]"
- If tools found: search "[tool name] pricing" + "[tool name] review / complaints"

Mark each pain point:
- BLUE_OCEAN: No mature solution → biggest opportunity
- IMPROVABLE: Solutions exist but users complain → explain what's wrong
- RED_OCEAN: Mature solutions with satisfied users → skip unless fundamentally different angle

Output: Competitive marker + search findings for each pain point.{LANG_SUFFIX}"""

    r3 = await _call_with_gate(providers, prompt=step3_prompt, validator=validate_competitive, max_tokens=4096)
    cost += r3.cost_usd; in_tok += r3.input_tokens; out_tok += r3.output_tokens
    step3_output = r3.content

    # Step 4: Solution design (creative phase, no gate)
    await progress_fn("round1", "Round 1 Step 4/4: Solution design...", 28)
    sc_block = _build_session_block(session_config)
    step4_prompt = f"""Round 1 / Step 4: Solution Design

Based on the 3-step research:

Pain point search:
{step1_output[:3000]}

Prevalence validation:
{step2_output[:2000]}

Competitive landscape:
{step3_output[:2000]}

Original context (for product mode constraints):
{context[:2000]}{sc_block}

Task:
- Focus on BLUE_OCEAN and IMPROVABLE pain points (skip RED_OCEAN)
- Design a solution for each valuable pain point
- Start from pain, not from technology
- User story: "[User type] needs [solution to X], because [current approach Y is broken]"
- 10x improvement: How is this 10x better than existing solutions?
- If product modes are specified in context, solutions MUST match those types
- For each solution, note the product form (SaaS, API, CLI, etc.)
- Solutions must be plausibly buildable within SESSION CONFIG's Budget + Timeline
  (default $10K / 4-8 weeks if SESSION CONFIG is absent).
{FACT_CLAIMS_RULE}
Reply with your complete pain analysis + solution designs.{LANG_SUFFIX}"""

    r4 = await _call_llm_with_search(providers, prompt=step4_prompt, max_tokens=4096)
    cost += r4.cost_usd; in_tok += r4.input_tokens; out_tok += r4.output_tokens
    step4_output = r4.content

    # Combine all steps (max_tokens controls output size, matching CLI behavior)
    combined = f"""## Pain Point Research

### Pain Discovery
{step1_output}

### Prevalence Validation
{step2_output}

### Competitive Landscape
{step3_output}

---

## Solution Design
{step4_output}"""

    return combined, cost, in_tok, out_tok


# ============================================================
# SESSION_CONFIG injection
# ============================================================

def _build_session_block(session_config: str, label: str = "SESSION CONFIG") -> str:
    """Format SESSION_CONFIG markdown into a labelled prompt block.

    Returns empty string when session_config is blank, so callers can
    inline this without conditional plumbing.

    The block is wrapped in `--- ... ---` markers so the LLM can
    distinguish user constraints from the rest of the prompt; an
    explicit override note tells it these values supersede any
    hardcoded defaults later in the prompt.
    """
    if not session_config or not session_config.strip():
        return ""
    return (
        f"\n\n--- {label} (overrides defaults like $10K / 4-8 weeks / 4-5 people / $100K/yr) ---\n"
        f"{session_config.strip()}\n"
        f"--- END {label} ---\n"
    )


# Default constraints used when SESSION_CONFIG is empty. Centralized
# here so when the prompt string changes the rest of the codebase
# continues to use the same fallback wording.
DEFAULT_LEAN_CONSTRAINTS = (
    "Defaults (used only if SESSION CONFIG above is empty):\n"
    "- MVP budget: ~$10K\n"
    "- Validation timeline: 4-8 weeks\n"
    "- Team: 4-5 people\n"
    "- Year-1 revenue threshold: $100K/yr"
)


# Hard-fact citation rule — injected into rounds where the LLM is most
# tempted to invent specific competitor names, pricing, funding amounts,
# contract statuses, or user counts. Without this, models like
# gpt-4o/Claude/Gemini will confidently hallucinate ("Portkey charges $9
# per 100k logs") because the prompt asks for concrete pricing.
#
# The rule mirrors `.claude/rules/FACT_CLAIMS.md` from the parent
# Idea-generator project: hard facts MUST cite, soft facts MUST tag,
# fabrications MUST be deleted.
FACT_CLAIMS_RULE = """
### Hard-Fact Citation Rule (CRITICAL — judges will check)

For any HARD FACT — specific competitor names + pricing, funding amounts, contract
statuses, user counts, market sizes, ARR figures — you MUST do ONE of:

1. **Cite inline** with `[REF: SEARCH] URL` if the fact came from a real search result
   in the upstream context. Example: `Stripe charges $0.30 per transaction [REF: SEARCH] https://stripe.com/pricing`

2. **Tag as estimate** with `[assumption]` plus a one-line basis if it's a reasoned
   estimate, not a real number. Example: `Average B2B SaaS ARPU around $150/mo [assumption]
   — based on industry benchmarks for similar developer tools`

3. **Delete it** if you can't cite or estimate — use generic phrasing instead.
   Example: write "competitive subscription pricing" rather than "$49/mo (CompetitorX)"

NEVER invent specific dollar amounts, customer counts, or contract states without a
source URL or `[assumption]` tag. Hallucinated specifics are the #1 way an idea gets
disqualified during fact-check review.
"""


# ============================================================
# Prompt builders (Rounds 2-5)
# ============================================================

def _build_proposer_prompt(round_num: int, context: str, prev_defender: str = "", session_config: str = "") -> str:
    sc_block = _build_session_block(session_config)
    if round_num == 2:
        return f"""Round {round_num} / From Pain to Solution

Defender selected the top 3-5 most valuable pain points:
{prev_defender}

Original context (for product mode constraints):
{context[:2000]}{sc_block}

Task:
- Design a solution for each high-value pain point
- If product modes were specified, solutions MUST match those product types
- Start from pain, not from technology
- User story: "[User type] needs [solution to X], because [current approach Y is broken]"
- 10x improvement: How is this 10x better than existing solutions?
- Use web search to validate each solution: search for competitors, pricing, user reviews
- For each solution, search "[competitor] vs" and "[competitor] pricing" to understand the landscape
{FACT_CLAIMS_RULE}
Reply with your complete analysis.{LANG_SUFFIX}"""

    elif round_num <= 4:
        return f"""Round {round_num} / Iterative Deepening

Defender's previous feedback:
{prev_defender}

Original context (for constraints):
{context[:1000]}{sc_block}

Task:
- Refine solutions based on Defender feedback
- Use web search to validate specific claims or find new data points
- Explore new possibilities and combinations
- Deepen the most promising directions
- If Defender identified "gold" in an idea, dig deeper into that
- Add specific product form and user experience details
- Search for analogous companies: "how did [similar company] get first 100 users"
{FACT_CLAIMS_RULE}
Reply with your complete analysis.{LANG_SUFFIX}"""

    else:  # Round 5
        return f"""Round {round_num} / Final Convergence

Defender's previous feedback:
{prev_defender}{sc_block}

Task:
- For each of Defender's Top 3 ideas, add vision description
- "What does success look like?"
- For each idea: core value proposition, target user, why now
- Use web search to find market size data and recent funding in each idea's space
- Recommend discussion order and rationale
{FACT_CLAIMS_RULE}
Reply with your complete analysis.{LANG_SUFFIX}"""


def _build_defender_prompt(round_num: int, proposer_output: str, context: str = "", session_config: str = "") -> str:
    role = """## Creative Coach Mode

You are a creative coach, not a critic.

### Responsibilities
- Help Proposer clarify vague ideas
- Ask good questions, don't give answers
- Identify the "gold" in each idea
- Guide without rejecting

### Question Templates
- "What's the core insight of this idea?"
- "If you could keep only one feature, what would it be?"
- "Who would go crazy for this?"
- "What does success look like?"
- "What's the exciting part of this idea?"

### Do NOT
- Say "this is not viable"
- Say "competitors already did this"
- Use any challenging/questioning tone
- Converge too early

### Do
- "This idea is interesting, can you elaborate?"
- "What I'm hearing is... is that right?"
- "What if we push this to the extreme?"
"""

    if round_num == 1:
        return f"""{role}

Round {round_num} / Pain Point Filtering

Proposer's discovered pain points and research:
{proposer_output}

Task:
- Which pain points are most widespread and intense?
- Which have no good existing solutions (BLUE_OCEAN / IMPROVABLE)?
- Which have commercial potential?
- If pain signal data exists: prioritize painkiller-level + rising trend clusters
- Select 3-5 most valuable pain points
- For each, explain selection criteria (prevalence, alternative quality, commercial space)

Do not reject any pain point, only filter and guide.
Reply with your complete feedback.{LANG_SUFFIX}"""

    elif round_num == 2:
        return f"""{role}

Round {round_num} / Solution Sharpening

Proposer's solutions:
{proposer_output}

{"Product mode constraints from context:" + chr(10) + context[:500] if context else ""}

Task — focus on SHARPENING each solution:
- For each solution: "What's the ONE thing that makes this 10x better than alternatives?"
- Strip away complexity: "If you could only build ONE feature for launch, what is it?"
- User story clarity: "Walk me through a user's first 5 minutes with this product"
- If product mode constraints exist: "How does this work as a [selected mode]?"
- Identify which 2-3 solutions have the sharpest value propositions

Reply with your complete feedback.{LANG_SUFFIX}"""

    elif round_num == 3:
        sc_block = _build_session_block(session_config)
        return f"""{role}

Round {round_num} / Business Model Deep-Dive

Proposer's refined solutions:
{proposer_output}{sc_block}

Task — focus on BUSINESS MODEL for each idea:
- "Who is writing the check? The user or their company?"
- "What's the natural pricing model? Per-seat? Usage-based? Flat rate?"
- "What would a competitor charge for this?" — when you cite competitor prices, the
  prices MUST come from the upstream Proposer search results (with `[REF: SEARCH] URL`).
  If the upstream didn't surface real pricing, write `[assumption]` with rough
  market-rate reasoning instead of fabricating a specific competitor + dollar amount.
- "Is there expansion revenue? Can you grow within an account?"
- Guide toward concrete pricing: "If you had to put a price tag on this TODAY, what would it be?"
- Cross-check pricing math against the user's `Revenue_threshold` from SESSION CONFIG (if provided);
  default $100K/yr otherwise. The pricing must show a plausible path to that target.
{FACT_CLAIMS_RULE}
Reply with your complete feedback.{LANG_SUFFIX}"""

    elif round_num == 4:
        return f"""{role}

Round {round_num} / Differentiation & Positioning

Proposer's solutions with business models:
{proposer_output}

Task — focus on DIFFERENTIATION:
- "What's the one-sentence pitch that makes someone stop scrolling?"
- "If a user is comparing this to [competitor], what makes them choose YOU?"
- "What can you do that incumbents structurally CANNOT do?"
- Identify each idea's unique angle — not just "better" but "different"
- Push for specificity: "Don't say 'AI-powered', say what the AI actually DOES differently"

Reply with your complete feedback.{LANG_SUFFIX}"""

    else:  # Round 5
        return f"""{role}

Round {round_num} / Final Selection

Proposer's final proposals:
{proposer_output}

Task:
- Select Top 3 Killer Ideas from all proposals
- CRITICAL: The 3 ideas MUST address DIFFERENT problem domains or user segments
  (NOT 3 variations of the same theme — if all ideas are about "AI monitoring", push for diversity)
- For each: what is the core value proposition in ONE sentence?
- Why these 3? (selection criteria: pain intensity, market clarity, differentiation strength)
- Rate each idea's "excitement level" (1-5 stars)
- For each idea: "What's the biggest risk?" and "What makes this a NOW opportunity?"

Reply with your Top 3 selection.{LANG_SUFFIX}"""


def _build_strategist_prompt(context: str, brainstorm: str, session_config: str = "") -> str:
    sc_block = _build_session_block(session_config)
    return f"""Task (Creative Integration Mode):

## Creative Integration

You join after Proposer + Defender complete 5 rounds of brainstorming with web search validation.

### Responsibilities
- Logic check: prerequisites, causal chains, missing links for each idea
- Structure: turn vague visions into executable frameworks
- Final output: generate STRUCTURED JSON

### Rules
- Every idea must have: prerequisites, core assumptions, validation method, kill switch
- Flag logic gaps with a warning
- Provide comparison analysis (no ranking — that's Defender's job)
- If "Product Modes" are specified in the context, ALL ideas MUST match those product types
- If target audience or constraints are specified, ideas must respect them
{FACT_CLAIMS_RULE}
This is the FINAL deliverable the user reads. Apply the citation rule above strictly to
the `revenue_model`, `target_market`, `competitive_landscape`, and `problem` fields —
those are where hallucinated competitor names + pricing slip in. If the brainstorm
didn't surface a real source for a specific dollar amount, replace the dollar amount
with `[assumption]` + reasoning, or use a generic phrase ("low-three-figures
subscription pricing in line with the segment").

--- CONTEXT (includes user preferences, product modes, constraints) ---
{context[:4000]}
--- END CONTEXT ---{sc_block}

--- BRAINSTORM (5 rounds of research + debate) ---
{brainstorm[:15000]}
--- END BRAINSTORM ---

## OUTPUT FORMAT

You MUST respond with a JSON object (no markdown fences, no extra text). The schema:

{{
  "ideas": [
    {{
      "rank": 1,
      "name": "Short product name (2-4 words)",
      "description": "2-3 sentence description of what it is and why it matters",
      "problem": "The core pain point it solves (with evidence from research)",
      "why_now": "Why this is the right time for this solution",
      "target_market": "Specific user persona and market segment",
      "moat": "Competitive advantage / defensibility",
      "revenue_model": "How it makes money (with pricing reference if found)",
      "kill_score": 7,
      "rice_score": {{
        "reach": 8,
        "impact": 7,
        "confidence": 6,
        "effort": 5,
        "total": 67
      }},
      "key_metrics": ["Metric 1", "Metric 2", "Metric 3", "Metric 4"],
      "validation_plan": [
        {{"assumption": "...", "method": "...", "success_criteria": "..."}}
      ],
      "kill_switch": ["Condition 1 -> Action", "Condition 2 -> Action"],
      "lean_feasibility": "LEAN_FIT",
      "product_form": "Web App (SaaS)",
      "product_form_fit": "NATURAL_FIT",
      "product_form_reason": "Why this product form is the best fit for solving this pain point",
      "competitive_landscape": "Brief summary of competitors found during research"
    }}
  ],
  "comparison": {{
    "dimensions": ["Core advantage", "Biggest risk", "Lean feasibility", "Time to validate", "Competitive density"],
    "idea_a": ["...", "...", "...", "...", "..."],
    "idea_b": ["...", "...", "...", "...", "..."],
    "idea_c": ["...", "...", "...", "...", "..."]
  }}
}}

### Scoring Guide
- **kill_score** (1-10): How well does this survive scrutiny? 8+ = strong, 5-7 = decent, <5 = weak
- **RICE scores** (1-10 each): Reach, Impact, Confidence, Effort. total = (reach * impact * confidence) / effort
- **lean_feasibility**: rate against user's Budget + Timeline. If SESSION CONFIG above
  specifies `Budget` and `Timeline`, use those as the LEAN_FIT bar. Otherwise default
  to $10K / 4-8 weeks. Bands (proportional to whichever Budget applies):
  - LEAN_FIT: cost ≤ Budget AND timeline ≤ Timeline
  - STRETCH: cost ≤ Budget × 2.5 AND timeline ≤ 1.5× Timeline
  - NOT_LEAN: anything beyond STRETCH
- **product_form_fit**: NATURAL_FIT (pain point naturally solved by this form) | ADAPTABLE (can work but not ideal) | FORCED (form doesn't match well)
- **product_form_reason**: 1-2 sentences explaining why this product form fits (or doesn't fit) the pain point

CRITICAL: You MUST output EXACTLY 3 ideas in the "ideas" array. Not 1, not 2, not 4. Exactly 3.
If the brainstorm only surfaced 2 strong ideas, generate a third from a different angle.

Return ONLY the JSON object. No markdown code fences. No explanation before or after."""


# ============================================================
# JSON parsing
# ============================================================

def _repair_json(s: str) -> str:
    """Attempt to repair truncated/malformed JSON from LLM output."""
    s = s.strip()
    if not s:
        return s

    # If it doesn't look like JSON, bail
    if not s.startswith("{") and not s.startswith("["):
        return s

    # Step 1: Close any unterminated string (find last unmatched quote)
    in_string = False
    escaped = False
    last_quote_pos = -1
    for i, ch in enumerate(s):
        if escaped:
            escaped = False
            continue
        if ch == '\\':
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            if in_string:
                last_quote_pos = i

    if in_string and last_quote_pos >= 0:
        # We're inside an unterminated string — close it
        s = s + '"'

    # Step 2: Remove trailing incomplete fragments
    s = re.sub(r',\s*$', '', s)  # trailing comma

    # Step 3: Close unmatched brackets/braces
    open_braces = s.count("{") - s.count("}")
    open_brackets = s.count("[") - s.count("]")
    s += "]" * max(0, open_brackets)
    s += "}" * max(0, open_braces)

    return s


def _parse_strategist_output(raw: str) -> list[dict]:
    """Parse structured JSON from Strategist, with fallback for malformed output."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
        cleaned = cleaned.strip()

    # Try direct parse first, then repair
    data = None
    for attempt_str in [cleaned, _repair_json(cleaned)]:
        try:
            data = json.loads(attempt_str)
            break
        except (json.JSONDecodeError, TypeError):
            continue

    if data is None:
        # Last resort: extract the largest {...} block
        json_match = re.search(r'\{[\s\S]*\}', cleaned)
        if json_match:
            try:
                data = json.loads(_repair_json(json_match.group()))
            except (json.JSONDecodeError, TypeError):
                pass

    if data and "ideas" in data:
        ideas = data.get("ideas", [])
        result = []
        for idea in ideas[:3]:
            result.append({
                "rank": idea.get("rank", len(result) + 1),
                "name": idea.get("name", "Unnamed Idea"),
                "description": idea.get("description", ""),
                "problem": idea.get("problem", ""),
                "why_now": idea.get("why_now", ""),
                "target_market": idea.get("target_market", ""),
                "moat": idea.get("moat", ""),
                "revenue_model": idea.get("revenue_model", ""),
                "kill_score": min(max(idea.get("kill_score", 5), 1), 10),
                "rice_score": _validate_rice(idea.get("rice_score", {})),
                "key_metrics": idea.get("key_metrics", [])[:6],
                "validation_plan": idea.get("validation_plan", [])[:5],
                "kill_switch": idea.get("kill_switch", [])[:3],
                "lean_feasibility": idea.get("lean_feasibility", "STRETCH"),
                "product_form": idea.get("product_form", ""),
                "product_form_fit": idea.get("product_form_fit", ""),
                "product_form_reason": idea.get("product_form_reason", ""),
                "competitive_landscape": idea.get("competitive_landscape", ""),
            })
        if result:
            return result

    # Fallback: return raw output wrapped in a single idea
    print(f"[STRATEGIST PARSE FAIL] raw length={len(raw)}, first 100={raw[:100]!r}", flush=True)
    return [{
        "rank": 1,
        "name": "Brainstorm Results",
        "description": raw[:500],
        "problem": "", "why_now": "", "target_market": "", "moat": "",
        "revenue_model": "",
        "kill_score": 5,
        "rice_score": {"reach": 5, "impact": 5, "confidence": 5, "effort": 5, "total": 25},
        "key_metrics": [], "validation_plan": [], "kill_switch": [],
        "lean_feasibility": "STRETCH", "product_form": "", "product_form_fit": "", "product_form_reason": "", "competitive_landscape": "",
    }]


def _validate_rice(rice: dict) -> dict:
    """Validate RICE score dict, calculate total if missing."""
    r = min(max(rice.get("reach", 5), 1), 10)
    i = min(max(rice.get("impact", 5), 1), 10)
    c = min(max(rice.get("confidence", 5), 1), 10)
    e = min(max(rice.get("effort", 5), 1), 10)
    total = rice.get("total") or round((r * i * c) / e)
    return {"reach": r, "impact": i, "confidence": c, "effort": e, "total": total}


# ============================================================
# Strategist retry + idea fill helpers
# ============================================================

async def _retry_strategist_json(
    raw_output: str, providers: Providers,
) -> tuple[list[dict], float, int, int]:
    """Retry Strategist with explicit JSON instruction when first attempt failed."""
    retry_prompt = f"""Your previous response was not valid JSON. Output ONLY the JSON object.

Here is the content to convert to JSON (extract the Top 3 ideas):
{raw_output[:4000]}

You MUST output EXACTLY 3 ideas. The JSON schema:
{{"ideas": [{{"rank": 1, "name": "...", "description": "...", "problem": "...", "why_now": "...", "target_market": "...", "moat": "...", "revenue_model": "...", "kill_score": 7, "rice_score": {{"reach": 7, "impact": 8, "confidence": 6, "effort": 5, "total": 67}}, "key_metrics": ["..."], "validation_plan": [{{"assumption": "...", "method": "...", "success_criteria": "..."}}], "kill_switch": ["..."], "lean_feasibility": "LEAN_FIT", "product_form": "Web App (SaaS)", "competitive_landscape": "..."}}]}}

EXACTLY 3 ideas. Return ONLY valid JSON. No markdown fences."""

    response = await providers.llm.call(
        prompt=retry_prompt, model=providers.model, max_tokens=6000, temperature=0.2,
    )
    ideas = _parse_strategist_output(response.content)
    return ideas, response.cost_usd, response.input_tokens, response.output_tokens


async def _fill_missing_ideas(
    existing_ideas: list[dict], context: str, brainstorm: str, providers: Providers,
) -> tuple[list[dict], float, int, int]:
    """
    Programmatically fill missing ideas to reach exactly 3.
    Calls LLM once per missing idea with explicit differentiation instruction.
    """
    cost = 0.0
    in_tok = 0
    out_tok = 0

    existing_names = [idea["name"] for idea in existing_ideas]

    while len(existing_ideas) < 3:
        idx = len(existing_ideas) + 1
        fill_prompt = f"""Generate 1 additional startup idea based on this brainstorm.

EXISTING IDEAS (you must NOT duplicate these):
{', '.join(existing_names)}

CONTEXT:
{context[:2000]}

BRAINSTORM SUMMARY:
{brainstorm[:4000]}

Generate idea #{idx} that is COMPLETELY DIFFERENT from the existing ideas above.
It must address a different pain point or target a different user segment.

Respond with ONLY a JSON object (no markdown fences):
{{
  "rank": {idx},
  "name": "Short product name (2-4 words)",
  "description": "2-3 sentence description",
  "problem": "The core pain point",
  "why_now": "Why now",
  "target_market": "Target users",
  "moat": "Competitive advantage",
  "revenue_model": "How it makes money",
  "kill_score": 6,
  "rice_score": {{"reach": 6, "impact": 7, "confidence": 5, "effort": 5, "total": 42}},
  "key_metrics": ["Metric 1", "Metric 2", "Metric 3"],
  "validation_plan": [{{"assumption": "...", "method": "...", "success_criteria": "..."}}],
  "kill_switch": ["Condition -> Action"],
  "lean_feasibility": "LEAN_FIT",
  "product_form": "Web App (SaaS)",
  "product_form_fit": "NATURAL_FIT",
  "product_form_reason": "Why this form fits the pain point",
  "competitive_landscape": "Brief competitive summary"
}}
{LANG_SUFFIX}"""

        response = await providers.llm.call(
            prompt=fill_prompt, model=providers.model, max_tokens=2000, temperature=0.5,
        )
        cost += response.cost_usd
        in_tok += response.input_tokens
        out_tok += response.output_tokens

        # Parse the single idea
        cleaned = response.content.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
            cleaned = cleaned.strip()

        try:
            # Try parsing as single idea
            idea_data = json.loads(_repair_json(cleaned))
            # Handle both {"rank":...} and {"ideas":[...]} formats
            if "ideas" in idea_data:
                idea_data = idea_data["ideas"][0]

            new_idea = {
                "rank": idx,
                "name": idea_data.get("name", f"Idea #{idx}"),
                "description": idea_data.get("description", ""),
                "problem": idea_data.get("problem", ""),
                "why_now": idea_data.get("why_now", ""),
                "target_market": idea_data.get("target_market", ""),
                "moat": idea_data.get("moat", ""),
                "revenue_model": idea_data.get("revenue_model", ""),
                "kill_score": min(max(idea_data.get("kill_score", 5), 1), 10),
                "rice_score": _validate_rice(idea_data.get("rice_score", {})),
                "key_metrics": idea_data.get("key_metrics", [])[:6],
                "validation_plan": idea_data.get("validation_plan", [])[:5],
                "kill_switch": idea_data.get("kill_switch", [])[:3],
                "lean_feasibility": idea_data.get("lean_feasibility", "STRETCH"),
                "product_form": idea_data.get("product_form", ""),
                "product_form_fit": idea_data.get("product_form_fit", ""),
                "product_form_reason": idea_data.get("product_form_reason", ""),
                "competitive_landscape": idea_data.get("competitive_landscape", ""),
            }

            # Deduplicate: skip if name matches existing
            if new_idea["name"] not in existing_names:
                existing_ideas.append(new_idea)
                existing_names.append(new_idea["name"])
                print(f"[FILL] Added idea #{idx}: {new_idea['name']}", flush=True)
            else:
                print(f"[FILL] Duplicate name '{new_idea['name']}', retrying...", flush=True)
                # Don't infinite loop — accept after one duplicate
                new_idea["name"] = f"{new_idea['name']} (Alt)"
                existing_ideas.append(new_idea)
                existing_names.append(new_idea["name"])
        except (json.JSONDecodeError, TypeError, KeyError) as e:
            print(f"[FILL] Parse error for idea #{idx}: {e}", flush=True)
            # Emergency fallback: create minimal idea from brainstorm
            existing_ideas.append({
                "rank": idx,
                "name": f"Emerging Idea #{idx}",
                "description": "Additional idea generated from brainstorm analysis.",
                "problem": "", "why_now": "", "target_market": "", "moat": "",
                "revenue_model": "",
                "kill_score": 5,
                "rice_score": {"reach": 5, "impact": 5, "confidence": 5, "effort": 5, "total": 25},
                "key_metrics": [], "validation_plan": [], "kill_switch": [],
                "lean_feasibility": "STRETCH", "product_form": "", "product_form_fit": "", "product_form_reason": "", "competitive_landscape": "",
            })

    return existing_ideas[:3], cost, in_tok, out_tok


# ============================================================
# Screening: 5-agent parallel Kill Vote + RICE Scoring (CLI parity)
# ============================================================

SCREENING_AGENTS = ["proposer", "challenger", "analyst", "defender", "reviewer"]

# System prompts for each screening agent (simulates CLI's independent agent personas)
AGENT_SYSTEM_PROMPTS = {
    "proposer": """You are the Proposer — a startup builder who evaluates ideas from the builder's gut.

Your core question: "Would I be EXCITED to build this? Would users PULL this from my hands?"

Your evaluation instincts:
1. Pain intensity: Is this a painkiller (must-have) or vitamin (nice-to-have)?
2. User clarity: Can I picture the exact person who needs this and their daily frustration?
3. First user: Do I know WHERE to find the first 10 users? (specific community, forum, Slack group)
4. Simplicity: Can the core value be explained in one sentence?
5. Pull vs Push: Would users seek this out, or would we need to convince them?

You PENALIZE: Ideas where you can't name a specific user community, technology-first solutions without clear pain, ideas that need long explanations.
You REWARD: Ideas that make you think "why doesn't this exist yet?", clear wedge into a market, products you'd personally want to use or recommend.

Score Reach HIGHER for ideas with obvious go-to-market (specific subreddit, HN audience, dev tool community).
Score Impact HIGHER for ideas that replace a painful manual process with something 10x better.""",

    "challenger": """You are the Challenger — a market viability interrogator with 3 thinking modes.

Mode 1 (Challenger): "Is this actually viable in the market?"
- Search for direct competitors and their traction
- Find failure cases of similar ideas (post-mortems, shutdowns)
- Question TAM claims with bottom-up math

Mode 2 (Contrarian): "What if the opposite is true?"
- Challenge the core premise. What if users DON'T want this?
- What if a big tech company ships this as a free feature tomorrow?

Mode 3 (Gap Finder): "What is everyone missing?"
- What blind spots exist in both the proposal AND the criticism?
- What adjacent opportunity is being overlooked?

Your scoring scale:
- 8-10: PROCEED (high viability, strong evidence)
- 6-7: CONDITIONAL (needs fixes but promising)
- 4-5: HOLD (insufficient validation)
- 1-3: REJECT (low viability, fatal flaws)
You are the HARDEST scorer. Default to skepticism. Demand evidence.""",

    "analyst": """You are the Analyst — a startup financial analyst focused on business model viability.

Your job is to evaluate whether an idea has a SOUND BUSINESS MODEL, not whether a specific team can build it (that's for later validation).

Your framework:
1. Revenue clarity: Is there a clear, specific way to charge? (subscription, usage-based, marketplace cut, etc.)
2. Pricing logic: Does the proposed pricing make sense relative to competitors and user willingness to pay?
3. Unit economics: Is LTV > CAC plausible? What's the gross margin structure?
4. Market size: Is the addressable market large enough to build a real business? (not just TAM — realistic serviceable market)
5. Path to revenue: How quickly could this idea generate its first dollar? Time-to-first
   scale milestone (e.g. $10K MRR ≈ $120K/yr if Revenue_threshold is $100K+; scale this
   milestone proportionally if SESSION CONFIG specifies a smaller Revenue_threshold —
   e.g. Solo $30K/yr → $2.5K MRR milestone)?

You PENALIZE: Vague "SaaS revenue" without specific pricing, ideas where users clearly won't pay, winner-take-all markets with entrenched incumbents.
You REWARD: Clear pricing tiers with competitor benchmarks, strong gross margins, fast time-to-first-revenue, expansion revenue potential (land-and-expand).

Score Confidence HIGHER when pricing is benchmarked against real competitors.
Score Confidence LOWER when revenue model is speculative with no market reference.""",

    "defender": """You are the Defender — an advocate who finds the BEST VERSION of each idea.

Your job is NOT to blindly defend. You look for what's SALVAGEABLE and how to make it work.

Your evaluation framework:
1. Analogues: Has something similar succeeded before? (e.g., "Datadog did this for infrastructure")
2. Adjustability: If the idea has flaws, can they be fixed with a scope change or pivot?
3. Hidden strength: What's the non-obvious advantage that others might miss?
4. Moat potential: Even if weak now, could a moat form over time? (data accumulation, network effects, switching costs)
5. Timing: Is there a window of opportunity that makes this idea uniquely viable RIGHT NOW?

You distinguish between:
- "Adjustable" problems (fixable with pivot, scope change, different GTM) → still vote to keep
- "Fatal" problems (structural impossibility, no users exist) → vote to kill

Score Effort realistically — don't inflate difficulty to kill an idea you don't like.
Score Confidence HIGHER for ideas with real-world analogues or proven adjacent markets.""",

    "reviewer": """You are the Reviewer — a final gatekeeper and assumption stress-tester.

Your powers:
1. FACT-CHECK: Every hard claim must have evidence. Flag uncited claims as [hallucination risk].
2. ASSUMPTION ATTACK: Identify the 3 most critical unverified assumptions for each idea.
3. EDGE CASES: What happens if a big tech enters? If regulation changes? If the platform shifts?
4. VETO AUTHORITY: You can flag fatal flaws, but must justify with specific evidence.

Your evaluation triggers:
- Legal red lines → automatic flag
- Tech impossibility → automatic flag
- Unverifiable core assumption → score Confidence at 2-3
- Strong evidence base → score Confidence at 8-9

You are the MOST conservative on Confidence scores.
Only give Confidence > 7 if you see validated assumptions with real data.
Default Confidence is 4-5 (hypothesis, not proven).""",
}


def _parse_json_response(content: str) -> dict | None:
    """Parse JSON from LLM response, handling code fences and thinking text."""
    cleaned = content.strip()

    # Strip code fences
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
        cleaned = cleaned.strip()

    # Try direct parse
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        pass

    # MiniMax often outputs thinking text before JSON — extract the JSON object
    # Find the first { and last } to extract embedded JSON
    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned)
    if json_match:
        try:
            return json.loads(json_match.group())
        except (json.JSONDecodeError, TypeError):
            pass

    # Try finding JSON with nested braces (for RICE responses with idea_a/idea_b)
    start = cleaned.find('{')
    if start >= 0:
        # Find matching closing brace
        depth = 0
        for i in range(start, len(cleaned)):
            if cleaned[i] == '{':
                depth += 1
            elif cleaned[i] == '}':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(cleaned[start:i+1])
                    except (json.JSONDecodeError, TypeError):
                        break

    return None


def _calc_rice(d: dict) -> float:
    """RICE = (Reach * Impact * Confidence) / Effort."""
    r = min(max(d.get("reach", 5), 1), 10)
    i = min(max(d.get("impact", 5), 1), 10)
    c = min(max(d.get("confidence", 5), 1), 10)
    e = min(max(d.get("effort", 5), 1), 10)
    return (r * i * c) / e


async def _run_screening(
    ideas: list[dict], providers: Providers, progress_fn, session_config: str = "",
) -> tuple[list[dict], float, int, int, dict]:
    """
    CLI-parity screening with 5 parallel agent perspectives:
    - 3 ideas: Kill Vote (5 agents) → RICE Score (5 agents) → Tiebreaker cascade
    - 2 ideas: Skip kill, RICE Score (5 agents) only

    Returns: (reordered_ideas, cost, in_tokens, out_tokens, screening_details)
    """
    import asyncio

    model = providers.model
    cost = 0.0
    in_tok = 0
    out_tok = 0

    idea_count = min(len(ideas), 3)
    idea_names = [idea["name"] for idea in ideas[:idea_count]]
    idea_summaries = "\n\n".join(
        f"### Idea #{i+1}: {idea['name']}\n"
        f"**Description:** {idea.get('description', '')}\n"
        f"**Problem:** {idea.get('problem', '')}\n"
        f"**Target:** {idea.get('target_market', '')}\n"
        f"**Revenue:** {idea.get('revenue_model', '')}\n"
        f"**Lean:** {idea.get('lean_feasibility', '')}"
        for i, idea in enumerate(ideas[:idea_count])
    )

    remaining_ideas = list(ideas[:idea_count])
    killed_ideas: list[dict] = []

    # Tracking for screening details
    kill_vote_details: list[dict] = []  # [{agent, killed, reason}]
    rice_score_details: list[dict] = []  # [{agent, idea_a_score, idea_b_score}]
    killed_name_result = None
    kill_vote_counts: dict[str, int] = {}
    tiebreaker_level = ""

    # --- Kill Vote: 5 agents vote in parallel (only if 3+ ideas) ---
    if idea_count >= 3:
        await progress_fn("screening", "Kill vote: 5 agents voting...", 88)

        sc_block = _build_session_block(session_config)
        kill_prompt_template = """You are the {agent} agent evaluating startup ideas.

Idea Screening — Kill Vote

Below are 3 Killer Ideas:

{summaries}{sc}

As the {agent}, pick the 1 WEAKEST idea to eliminate. Consider:
- Is the pain point real and strong enough?
- Is the market opportunity large enough?
- Can the team described in SESSION CONFIG above build this within their Budget + Timeline?
  (Default to a 4-5 person team / $10K budget / 4-8 weeks if SESSION CONFIG is absent.)
- Are there obvious fatal flaws?

{perspective}

Respond in JSON (no markdown fences):
{{"kill": "exact idea name", "reason": "2-3 sentences"}}

The name MUST be one of: {names}"""

        agent_perspectives = {
            "proposer": "Focus on: Which idea has the weakest user pain point? Which solution is least compelling?",
            "challenger": "Focus on: Which idea has the most fatal competitive risk? Which market is most saturated?",
            "analyst": "Focus on: Which idea has the worst unit economics? Which is hardest to monetize?",
            "defender": "Focus on: Which idea is hardest to defend against copycats? Which has the weakest moat?",
            "reviewer": "Focus on: Which idea has the most unrealistic assumptions? Which has the biggest logic gaps?",
        }

        async def _kill_vote(agent: str) -> dict | None:
            prompt = kill_prompt_template.format(
                agent=agent, summaries=idea_summaries,
                perspective=agent_perspectives[agent],
                names=json.dumps(idea_names),
                sc=sc_block,
            )
            resp = await providers.llm.call(
                prompt=prompt, model=model, max_tokens=500, temperature=0.3,
                system_prompt=AGENT_SYSTEM_PROMPTS.get(agent),
            )
            parsed = _parse_json_response(resp.content)
            if not parsed:
                # Fuzzy fallback: find which idea name appears
                for name in idea_names:
                    if name.lower() in resp.content.lower():
                        parsed = {"kill": name, "reason": "fuzzy match"}
                        break
            return resp, parsed

        kill_tasks = [_kill_vote(agent) for agent in SCREENING_AGENTS]
        kill_results = await asyncio.gather(*kill_tasks, return_exceptions=True)

        # Tally votes
        kill_votes: dict[str, int] = {}
        for i, result in enumerate(kill_results):
            if isinstance(result, Exception):
                print(f"[SCREEN] {SCREENING_AGENTS[i]} kill vote failed: {result}", flush=True)
                continue
            resp, data = result
            cost += resp.cost_usd
            in_tok += resp.input_tokens
            out_tok += resp.output_tokens
            if data and data.get("kill"):
                name = data["kill"]
                kill_votes[name] = kill_votes.get(name, 0) + 1
                kill_vote_details.append({"agent": SCREENING_AGENTS[i], "killed": name, "reason": data.get("reason", "")})
                print(f"[SCREEN] {SCREENING_AGENTS[i]} kills: {name}", flush=True)

        # Eliminate idea with most votes
        kill_vote_counts = kill_votes
        if kill_votes:
            killed_name = max(kill_votes, key=kill_votes.get)
            killed_name_result = killed_name
            print(f"[SCREEN] Kill result: {killed_name} ({kill_votes[killed_name]}/{len(kill_results)} votes)", flush=True)
            remaining_ideas = [idea for idea in ideas[:3] if idea["name"] != killed_name]
            killed_ideas = [idea for idea in ideas[:3] if idea["name"] == killed_name]
        else:
            remaining_ideas = list(ideas[:2])
            killed_ideas = list(ideas[2:3])

        if len(remaining_ideas) < 2:
            remaining_ideas = list(ideas[:2])
            killed_ideas = list(ideas[2:3])

    # --- RICE Score: 5 agents score in parallel ---
    await progress_fn("screening", "RICE scoring: 5 agents evaluating...", 91)

    rice_prompt_template = """RICE Scoring — {agent} perspective. Output ONLY JSON, no explanation.

Idea A: {name_a} — {desc_a}
Idea B: {name_b} — {desc_b}

Score each on Reach, Impact, Confidence, Effort (1-10).
{perspective}

RESPOND WITH ONLY THIS JSON, NOTHING ELSE:
{{"idea_a": {{"reach": 8, "impact": 7, "confidence": 6, "effort": 5}}, "idea_b": {{"reach": 7, "impact": 8, "confidence": 5, "effort": 6}}}}"""

    rice_perspectives = {
        "proposer": "Score from the builder's perspective: which is more exciting to build and has clearer product-market fit?",
        "challenger": "Score critically: which has more realistic reach and fewer hidden risks?",
        "analyst": "Score on business viability: which has better unit economics and clearer path to revenue?",
        "defender": "Score on defensibility: which has stronger moat and is harder to copy?",
        "reviewer": "Score on evidence: which has more validated assumptions and fewer logic gaps?",
    }

    async def _rice_vote(agent: str) -> tuple:
        prompt = rice_prompt_template.format(
            agent=agent,
            name_a=remaining_ideas[0]["name"], desc_a=remaining_ideas[0].get("description", ""),
            prob_a=remaining_ideas[0].get("problem", ""),
            name_b=remaining_ideas[1]["name"], desc_b=remaining_ideas[1].get("description", ""),
            prob_b=remaining_ideas[1].get("problem", ""),
            perspective=rice_perspectives[agent],
        )
        resp = await providers.llm.call(
            prompt=prompt, model=model, max_tokens=1500, temperature=0.2,
            system_prompt=AGENT_SYSTEM_PROMPTS.get(agent),
        )
        parsed = _parse_json_response(resp.content)
        if not parsed:
            print(f"[SCREEN] {agent} RICE parse fail, raw: {resp.content[:200]}", flush=True)
        return resp, parsed

    rice_tasks = [_rice_vote(agent) for agent in SCREENING_AGENTS]
    rice_results = await asyncio.gather(*rice_tasks, return_exceptions=True)

    # Collect per-agent scores
    agent_scores: dict[str, dict] = {}  # {agent: {"idea_a": {r,i,c,e,total}, "idea_b": ...}}
    for i, result in enumerate(rice_results):
        agent = SCREENING_AGENTS[i]
        if isinstance(result, Exception):
            print(f"[SCREEN] {agent} RICE failed: {result}", flush=True)
            continue
        resp, data = result
        cost += resp.cost_usd
        in_tok += resp.input_tokens
        out_tok += resp.output_tokens
        if data:
            scores = {}
            for key in ["idea_a", "idea_b"]:
                d = data.get(key, {})
                scores[key] = {"total": _calc_rice(d), **d}
            agent_scores[agent] = scores
            rice_score_details.append({
                "agent": agent,
                "idea_a": round(scores["idea_a"]["total"]),
                "idea_b": round(scores["idea_b"]["total"]),
            })
            print(f"[SCREEN] {agent} RICE: A={scores['idea_a']['total']:.0f} B={scores['idea_b']['total']:.0f}", flush=True)

    # Tiebreaker cascade (CLI parity): all → -proposer → -challenger → -defender → reviewer only
    def _total_score(idea_key: str, exclude: list[str] | None = None) -> float:
        total = 0.0
        for agent, scores in agent_scores.items():
            if exclude and agent in exclude:
                continue
            total += scores.get(idea_key, {}).get("total", 0)
        return total

    tiebreaker_order = [
        ("all agents", []),
        ("-proposer", ["proposer"]),
        ("-challenger", ["proposer", "challenger"]),
        ("-defender", ["proposer", "challenger", "defender"]),
    ]

    winner_key = None
    for label, exclude in tiebreaker_order:
        s_a = _total_score("idea_a", exclude)
        s_b = _total_score("idea_b", exclude)
        print(f"[SCREEN] {label}: A={s_a:.0f} vs B={s_b:.0f}", flush=True)
        if s_a != s_b:
            winner_key = "idea_a" if s_a > s_b else "idea_b"
            tiebreaker_level = label
            break

    if winner_key is None:
        # Reviewer only
        reviewer_scores = agent_scores.get("reviewer", {})
        r_a = reviewer_scores.get("idea_a", {}).get("total", 0)
        r_b = reviewer_scores.get("idea_b", {}).get("total", 0)
        if r_a != r_b:
            winner_key = "idea_a" if r_a > r_b else "idea_b"
            print(f"[SCREEN] Reviewer decides: {'A' if winner_key == 'idea_a' else 'B'}", flush=True)
        else:
            # Ultimate fallback: Strategist picks
            pick_resp = await providers.llm.call(
                prompt=f"Pick the better startup idea. Reply with ONLY the name.\nA: {remaining_ideas[0]['name']}\nB: {remaining_ideas[1]['name']}",
                model=model, max_tokens=50, temperature=0.0,
            )
            cost += pick_resp.cost_usd
            in_tok += pick_resp.input_tokens
            out_tok += pick_resp.output_tokens
            winner_key = "idea_a" if remaining_ideas[0]["name"] in pick_resp.content else "idea_b"
            print(f"[SCREEN] Strategist tiebreak: {pick_resp.content.strip()}", flush=True)

    # Update RICE scores from aggregate
    for key, idx in [("idea_a", 0), ("idea_b", 1)]:
        if idx < len(remaining_ideas) and agent_scores:
            # Average RICE across all agents
            avg = {"reach": 0, "impact": 0, "confidence": 0, "effort": 0}
            count = 0
            for scores in agent_scores.values():
                d = scores.get(key, {})
                if d:
                    for dim in avg:
                        avg[dim] += d.get(dim, 5)
                    count += 1
            if count > 0:
                for dim in avg:
                    avg[dim] = round(avg[dim] / count)
                remaining_ideas[idx]["rice_score"] = _validate_rice(avg)

    # Reorder by winner
    if winner_key == "idea_b":
        remaining_ideas = [remaining_ideas[1], remaining_ideas[0]]

    # Reassign ranks
    final_ideas = []
    for i, idea in enumerate(remaining_ideas[:2]):
        idea["rank"] = i + 1
        final_ideas.append(idea)
    for idea in killed_ideas:
        idea["rank"] = 3
        final_ideas.append(idea)

    screening_details = {
        "kill_votes": kill_vote_details,
        "kill_result": killed_name_result,
        "kill_vote_counts": kill_vote_counts,
        "rice_scores": rice_score_details,
        "rice_idea_a": remaining_ideas[0]["name"] if remaining_ideas else "",
        "rice_idea_b": remaining_ideas[1]["name"] if len(remaining_ideas) > 1 else "",
        "rice_total_a": round(_total_score("idea_a")) if agent_scores else 0,
        "rice_total_b": round(_total_score("idea_b")) if agent_scores else 0,
        "tiebreaker_level": tiebreaker_level,
        "winner": final_ideas[0]["name"] if final_ideas else "",
    }

    return final_ideas, cost, in_tok, out_tok, screening_details


# ============================================================
# Main runner
# ============================================================

async def run_ideation(
    session_id: str,
    context: str,
    providers: Providers,
    on_progress: callable = None,
    session_config: str = "",
) -> dict:
    """
    Run 5-round ideation pipeline with full CLI parity.

    Round 1: 4-step gated pain discovery (4 LLM calls with search)
    Rounds 2-5: Proposer (with search) + Defender
    Strategist: structured JSON integration

    Args:
        session_id: Supabase session ID.
        context: Scout report or user-provided context.
        providers: LLM + Storage + Search providers.
        on_progress: Optional async callback(step, message, pct).
        session_config: Optional SESSION_CONFIG.md (Profile/Budget/Timeline/Revenue_threshold).
                        Overrides hardcoded $10K / 4-8wk / 4-5 people / $100K defaults
                        when present. See _build_session_block().

    Returns:
        dict with rounds, top_ideas, and costs.
    """
    model = providers.model
    total_cost = 0.0
    total_in = 0
    total_out = 0
    rounds = []
    brainstorm = ""

    async def progress(step, msg, pct=None):
        if on_progress:
            await on_progress(step, msg, pct)

    try:
        await providers.storage.update_status("forge_sessions", session_id, "running")

        # ---- Round 1: Gated multi-step pain discovery ----
        await progress("round1", "Round 1/5: Gated pain discovery (4 steps)...", 3)

        r1_output, r1_cost, r1_in, r1_out = await _run_gated_round1(
            context=context, providers=providers, progress_fn=progress,
            session_config=session_config,
        )
        total_cost += r1_cost
        total_in += r1_in
        total_out += r1_out

        brainstorm += f"\n\n## Round 1 - Proposer\n\n{r1_output}"

        # Defender Round 1
        await progress("brainstorm", "Round 1/5: Defender filtering pain points...", 32)
        defender_prompt = _build_defender_prompt(1, r1_output, context, session_config)
        defender_response = await providers.llm.call(
            prompt=defender_prompt, model=model, max_tokens=3000,
        )
        total_cost += defender_response.cost_usd
        total_in += defender_response.input_tokens
        total_out += defender_response.output_tokens
        defender_output = defender_response.content
        prev_defender = defender_output

        brainstorm += f"\n\n## Round 1 - Defender\n\n{defender_output}"

        round_data = {
            "round": 1,
            "proposer": r1_output,
            "defender": defender_output,
            "proposer_cost": r1_cost,
            "defender_cost": defender_response.cost_usd,
            "proposer_tokens": r1_in,
            "proposer_out_tokens": r1_out,
            "defender_tokens": defender_response.input_tokens,
            "defender_out_tokens": defender_response.output_tokens,
        }
        rounds.append(round_data)
        await providers.storage.append_round(session_id, round_data)

        # ---- Rounds 2-5: Proposer (with search) + Defender ----
        for round_num in range(2, MAX_ROUNDS + 1):
            pct_base = 35 + int((round_num - 2) / (MAX_ROUNDS - 1) * 40)

            # Proposer with search (R2 has quality gate for search evidence)
            await progress("brainstorm", f"Round {round_num}/{MAX_ROUNDS}: Proposer researching...", pct_base)
            proposer_prompt = _build_proposer_prompt(round_num, context, prev_defender, session_config)
            if round_num == 2:
                proposer_response = await _call_with_gate(
                    providers, prompt=proposer_prompt, validator=validate_solution_design,
                    max_tokens=4096, use_search=True,
                )
            else:
                proposer_response = await _call_llm_with_search(
                    providers, prompt=proposer_prompt, max_tokens=4096,
                )
            total_cost += proposer_response.cost_usd
            total_in += proposer_response.input_tokens
            total_out += proposer_response.output_tokens
            proposer_output = proposer_response.content

            brainstorm += f"\n\n## Round {round_num} - Proposer\n\n{proposer_output}"

            # Defender
            await progress("brainstorm", f"Round {round_num}/{MAX_ROUNDS}: Defender responding...", pct_base + 7)
            defender_prompt = _build_defender_prompt(round_num, proposer_output, context, session_config)
            defender_response = await providers.llm.call(
                prompt=defender_prompt, model=model, max_tokens=3000,
            )
            total_cost += defender_response.cost_usd
            total_in += defender_response.input_tokens
            total_out += defender_response.output_tokens
            defender_output = defender_response.content
            prev_defender = defender_output

            brainstorm += f"\n\n## Round {round_num} - Defender\n\n{defender_output}"

            round_data = {
                "round": round_num,
                "proposer": proposer_output,
                "defender": defender_output,
                "proposer_cost": proposer_response.cost_usd,
                "defender_cost": defender_response.cost_usd,
                "proposer_tokens": proposer_response.input_tokens,
                "proposer_out_tokens": proposer_response.output_tokens,
                "defender_tokens": defender_response.input_tokens,
                "defender_out_tokens": defender_response.output_tokens,
            }
            rounds.append(round_data)
            await providers.storage.append_round(session_id, round_data)

        # ---- Strategist integration (enforced 3 ideas) ----
        await progress("strategist", "Strategist integrating Top 3 ideas...", 82)

        strategist_prompt = _build_strategist_prompt(context, brainstorm, session_config)
        strategist_response = await providers.llm.call(
            prompt=strategist_prompt, model=model, max_tokens=8192,
            temperature=0.4,
        )
        total_cost += strategist_response.cost_usd
        total_in += strategist_response.input_tokens
        total_out += strategist_response.output_tokens

        top_ideas = _parse_strategist_output(strategist_response.content)
        is_fallback = len(top_ideas) == 1 and top_ideas[0]["name"] == "Brainstorm Results"

        # Retry if JSON parse failed
        if is_fallback:
            await progress("strategist", "Strategist retry: fixing JSON output...", 84)
            top_ideas, retry_cost, retry_in, retry_out = await _retry_strategist_json(
                strategist_response.content, providers,
            )
            total_cost += retry_cost
            total_in += retry_in
            total_out += retry_out
            is_fallback = len(top_ideas) == 1 and top_ideas[0]["name"] == "Brainstorm Results"

        # Enforce exactly 3 ideas — fill missing with additional LLM calls
        if not is_fallback and len(top_ideas) < 3:
            await progress("strategist", f"Generating {3 - len(top_ideas)} more idea(s) to reach 3...", 86)
            top_ideas, fill_cost, fill_in, fill_out = await _fill_missing_ideas(
                top_ideas, context, brainstorm, providers,
            )
            total_cost += fill_cost
            total_in += fill_in
            total_out += fill_out

        # ---- Screening: Kill Vote + RICE Scoring (always runs if 3 ideas) ----
        screening_data = None
        if len(top_ideas) >= 3:
            await progress("screening", "Screening: Kill vote + RICE scoring...", 88)
            top_ideas, screen_cost, screen_in, screen_out, screening_data = await _run_screening(
                top_ideas, providers, progress, session_config,
            )
            total_cost += screen_cost
            total_in += screen_in
            total_out += screen_out
        elif len(top_ideas) == 2:
            # Only 2 ideas (shouldn't happen after fill, but safety net)
            await progress("screening", "RICE scoring 2 ideas...", 88)
            top_ideas, screen_cost, screen_in, screen_out, screening_data = await _run_screening(
                top_ideas, providers, progress, session_config,
            )
            total_cost += screen_cost
            total_in += screen_in
            total_out += screen_out

        # Extract R1 research URLs as sources
        r1_text = rounds[0]["proposer"] if rounds else ""
        source_urls = list(dict.fromkeys(re.findall(r'https?://\S+', r1_text)))[:20]  # dedupe, max 20

        # Attach screening details + sources to top_ideas for frontend
        enriched_ideas = list(top_ideas)
        if enriched_ideas:
            enriched_ideas[0]["_screening"] = screening_data
            enriched_ideas[0]["_sources"] = source_urls

        # Save final results
        await progress("save", "Saving results...", 95)

        await providers.storage.save_forge_results(
            session_id=session_id,
            rounds=rounds,
            top_ideas=enriched_ideas,
            total_cost_usd=total_cost,
            total_input_tokens=total_in,
            total_output_tokens=total_out,
            model=model,
        )

        await progress("done", f"Ideation complete! {MAX_ROUNDS} rounds + screening. Cost: ${total_cost:.2f}", 100)

        return {
            "session_id": session_id,
            "rounds": rounds,
            "top_ideas": top_ideas,
            "brainstorm": brainstorm,
            "costs": {"total_usd": round(total_cost, 4)},
        }

    except Exception as e:
        await providers.storage.update_status("forge_sessions", session_id, "error")
        raise
