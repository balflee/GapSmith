"""
Quality Gate Validators for Forge ideation pipeline.
Ported from CLI pipeline/debate_validators.py for web parity.
Each validator returns (passed: bool, feedback: str).
"""

import re


def _count_urls(text: str) -> int:
    return len(re.findall(r'https?://\S+', text))


def _count_refs(text: str) -> int:
    return text.count('[REF: SEARCH]') + text.count('[REF: INPUT]') + text.count('[REF:')


def _count_list_items(text: str) -> int:
    """Count markdown list items (- item or N. item)."""
    return len(re.findall(r'^\s*(?:[-*]|\d+[.)]) \S', text, re.MULTILINE))


def _count_price_mentions(text: str) -> int:
    return len(re.findall(r'\$\d+', text))


def _has_markers(text: str, markers: list[str]) -> bool:
    return any(m.lower() in text.lower() for m in markers)


# --- Proposer Ideation validators ---

def validate_pain_discovery(output: str) -> tuple[bool, str]:
    """Gate after Proposer Step 1: pain point search."""
    issues = []

    pain_count = _count_list_items(output)
    if pain_count < 5:
        issues.append(
            f"Only found ~{pain_count} pain points, need at least 5. "
            "Search more platforms (Reddit, HN, Twitter, GitHub Issues)."
        )

    evidence_count = _count_urls(output) + _count_refs(output)
    if evidence_count < 3:
        issues.append(
            f"Only {evidence_count} source references. Most pain points lack search evidence. "
            "Add [REF: SEARCH] + URL for each pain point."
        )

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


def validate_prevalence(output: str) -> tuple[bool, str]:
    """Gate after Proposer Step 2: prevalence check."""
    issues = []

    has_freq = _has_markers(output, [
        'HIGH', 'MEDIUM', 'LOW', 'high freq', 'medium freq', 'low freq',
        'widespread', 'niche', 'common',
    ])
    if not has_freq:
        issues.append(
            "Missing frequency/prevalence assessment. Mark each pain point as "
            "HIGH / MEDIUM / LOW frequency with supporting evidence (upvote count, mention count)."
        )

    evidence_count = _count_urls(output) + _count_refs(output)
    if evidence_count < 2:
        issues.append(
            "Prevalence validation lacks search evidence. "
            "Search for related post interaction data to support frequency assessment."
        )

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


def validate_competitive(output: str) -> tuple[bool, str]:
    """Gate after Proposer Step 3: competitive landscape."""
    issues = []

    has_landscape = _has_markers(output, [
        'BLUE_OCEAN', 'IMPROVABLE', 'RED_OCEAN',
        'blue ocean', 'improvable', 'red ocean',
        'no mature solution', 'no direct competitor',
        'solutions exist', 'competitors include',
    ])
    if not has_landscape:
        issues.append(
            "Missing competitive markers. Mark each pain point as "
            "BLUE_OCEAN (no solution) / IMPROVABLE (exists but poor) / RED_OCEAN (mature solutions). "
            "Search '[pain point] solution/tool/SaaS' to confirm."
        )

    evidence_count = _count_urls(output) + _count_refs(output)
    if evidence_count < 2:
        issues.append(
            "Competitive search evidence insufficient. "
            "Search for existing tools and their pricing/reviews."
        )

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


def validate_solution_design(output: str) -> tuple[bool, str]:
    """Gate after Round 2: solution design must include search evidence."""
    issues = []

    evidence_count = _count_urls(output) + _count_refs(output)
    if evidence_count < 2:
        issues.append(
            "Solution design lacks search evidence. "
            "Use web search to validate each solution: search for competitors, "
            "pricing, and user reviews. Include URLs as evidence."
        )

    has_pricing = _count_price_mentions(output) >= 1
    if not has_pricing:
        issues.append(
            "No competitor pricing data found. "
            "Search '[competitor] pricing' to ground your revenue model."
        )

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


# --- Prove (debate) validators — ported from pipeline/debate_validators.py ---

def validate_competitor_search(output: str) -> tuple[bool, str]:
    """Gate after Challenger Step 1: competitor deep-dive."""
    issues = []

    url_count = _count_urls(output)
    if url_count < 2:
        issues.append(
            "Missing competitor evidence links. Search Product Hunt/G2/Capterra, "
            "or directly search competitor websites. Provide URLs."
        )

    has_pricing = _count_price_mentions(output) >= 1
    if not has_pricing:
        issues.append(
            "Missing competitor pricing data. Search '[competitor] pricing' for concrete numbers."
        )

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


def validate_counter_evidence(output: str) -> tuple[bool, str]:
    """Gate after Challenger Step 2: failure cases / market data."""
    issues = []

    url_count = _count_urls(output)
    has_case = any(
        kw in output.lower()
        for kw in ['failed', 'shutdown', 'pivot', 'post-mortem', '失败', '关闭', '转型']
    )
    has_data = _count_price_mentions(output) >= 1 or bool(re.search(r'\d+%', output))

    if url_count < 1 and not has_case and not has_data:
        issues.append(
            "Challenges lack data support. Search for similar project failures, "
            "market data, or user behavior data. Provide at least 1 sourced data point."
        )

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


def validate_pricing_data(output: str) -> tuple[bool, str]:
    """Gate after Analyst Step 1: pricing benchmarks."""
    issues = []

    price_count = _count_price_mentions(output)
    if price_count < 2:
        issues.append(
            f"Only {price_count} pricing data points — need at least 2 competitor prices. "
            "Search '[competitor] pricing page'."
        )

    url_count = _count_urls(output)
    if url_count < 1:
        issues.append("Missing pricing source links. Attach competitor pricing page URLs.")

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


def validate_cost_structure(output: str) -> tuple[bool, str]:
    """Gate after Analyst Step 2: cost breakdown."""
    issues = []

    price_count = _count_price_mentions(output)
    if price_count < 3:
        issues.append(
            "Cost structure missing concrete amounts. List each cost item "
            "(infrastructure, API, third-party services) with $ amounts."
        )

    has_total = any(kw in output for kw in ['Total', 'total', 'MVP cost', 'MVP Cost', '总计', 'MVP 成本'])
    if not has_total:
        issues.append("Missing cost total. Provide an MVP total cost estimate at the bottom.")

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


def validate_evidence(output: str) -> tuple[bool, str]:
    """Gate after Defender Step 1: evidence search for challenges."""
    issues = []

    url_count = _count_urls(output)
    has_not_found = any(
        kw in output
        for kw in ['no evidence found', 'unverified', '[unverified]', 'not found',
                   '未找到证据', '待验证', '[待验证]', '没有找到', '无相关结果']
    )

    if url_count < 1 and not has_not_found:
        issues.append(
            "Response lacks search evidence. Search real cases/data for each ❌ challenge, "
            "or honestly mark [unverified]."
        )

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""


# --- Citation-quality gates (for budget models that tend to drop sources) ---

def _make_citation_validator(min_urls: int, agent_name: str):
    """Factory: returns a validator that requires N inline URLs in the output."""
    def _v(output: str) -> tuple[bool, str]:
        url_count = _count_urls(output)
        ref_count = _count_refs(output)
        # Accept either raw URLs or [REF: ...] citations as valid attribution
        total = url_count + ref_count
        if total >= min_urls:
            return True, ""
        return False, (
            f"Only {total} source citations found ({url_count} URLs + {ref_count} [REF: ...] tags), "
            f"need at least {min_urls} for a {agent_name} output. "
            "Every substantive claim must have an inline citation — use `[REF: SEARCH] https://...` "
            "or bare URLs. Do NOT make up sources; if a claim is unverified, label `[unverified]` "
            "and move on."
        )
    return _v


def validate_analyst_final(output: str) -> tuple[bool, str]:
    """Analyst final synthesis — should cite pricing/benchmark sources from upstream."""
    return _make_citation_validator(min_urls=3, agent_name="Analyst financial analysis")(output)


def validate_defender_final(output: str) -> tuple[bool, str]:
    """Defender final response — should cite evidence URLs from Step 1 + Evidence Hunter."""
    return _make_citation_validator(min_urls=2, agent_name="Defender response")(output)


def validate_contrarian(output: str) -> tuple[bool, str]:
    """Contrarian alternatives — each alt should cite a real case."""
    return _make_citation_validator(min_urls=2, agent_name="Contrarian alternatives")(output)


def validate_gap_finder(output: str) -> tuple[bool, str]:
    """Gap Finder blind spots — each blind spot should cite a real case."""
    return _make_citation_validator(min_urls=2, agent_name="Gap Finder blind spots")(output)


def validate_evidence_hunter(output: str) -> tuple[bool, str]:
    """Evidence Hunter — job is literally to find evidence with URLs."""
    return _make_citation_validator(min_urls=3, agent_name="Evidence Hunter report")(output)


def validate_proposer(output: str) -> tuple[bool, str]:
    """Proposer — should carry through Trend Scout URLs + cite market/competitor sources."""
    return _make_citation_validator(min_urls=3, agent_name="Proposer proposal")(output)


def validate_fact_check_reviewer(output: str) -> tuple[bool, str]:
    """Phase A.5 Reviewer — fact-check without sources is conceptually broken."""
    return _make_citation_validator(min_urls=2, agent_name="Reviewer fact-check")(output)


def validate_trend_scout(output: str) -> tuple[bool, str]:
    """Trend Scout sub-agent — its whole job is web search; min 5 URLs."""
    return _make_citation_validator(min_urls=5, agent_name="Trend Scout report")(output)


def validate_challenger_final(output: str) -> tuple[bool, str]:
    """Challenger Step 3 synthesis — should carry through Steps 1-2 competitor + evidence URLs."""
    return _make_citation_validator(min_urls=3, agent_name="Challenger final challenge")(output)


def validate_benchmark_hunter(output: str) -> tuple[bool, str]:
    """Benchmark Hunter — its entire job is finding real competitor pricing URLs."""
    return _make_citation_validator(min_urls=3, agent_name="Benchmark Hunter report")(output)


def validate_reviewer_attack(output: str) -> tuple[bool, str]:
    """Reviewer Phase B final assumption attack — should cite reverse-evidence URLs from Step 1."""
    return _make_citation_validator(min_urls=2, agent_name="Reviewer assumption attack")(output)


def validate_reverse_search(output: str) -> tuple[bool, str]:
    """Gate after Reviewer Step 1: reverse evidence search."""
    issues = []

    url_count = _count_urls(output)
    if url_count < 2:
        issues.append(
            "Assumption attacks lack search evidence. Use reverse-search to find "
            "'doesn't hold' signals for each assumption."
        )

    attack_count = len(re.findall(r'Assumption Attack|假设攻击|🔴', output))
    if attack_count < 2:
        issues.append("Insufficient assumption attacks — need at least 3.")

    if issues:
        return False, "\n".join(f"- {i}" for i in issues)
    return True, ""
