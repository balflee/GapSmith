"""
Unit tests for the search-query generation layer (debate_helpers +
ideation_runner). Two surfaces here:

1. _clean_domain — strips markdown / version / status noise from extracted
   domain text so templated queries don't carry literal "#", "v0.4",
   Chinese version-doc suffixes etc. that Tavily can't tokenize.

2. extract_search_queries — uses the cleaner so the templated queries are
   actually usable. Lock down a few real-world inputs that motivated the
   fix (the 2026-05-08 SG banking compliance prove debate had domain =
   "# APAC L&D Simulation 平台 — 概念文档 v0.4", which produced "{noisy}
   tools solutions comparison 2025 2026" → blog spam).

The LLM-generated path (llm_generate_queries) has its own real-LLM smoke
in smoke_query_gen.py since unit tests can't usefully exercise prompt
quality.
"""

from engine.core.debate_helpers import (
    _clean_domain,
    extract_search_queries,
)


# ---------------------------------------------------------------
# _clean_domain
# ---------------------------------------------------------------

def test_strips_leading_markdown_heading():
    assert _clean_domain("# AgentMeter") == "AgentMeter"
    assert _clean_domain("## My Idea") == "My Idea"
    assert _clean_domain("### Heading") == "Heading"


def test_strips_chinese_version_doc_suffix():
    """The exact noise from the 2026-05-08 SG banking debate."""
    assert _clean_domain("# APAC L&D Simulation 平台 — 概念文档 v0.4") == "APAC L&D Simulation 平台"
    assert _clean_domain("APAC L&D Simulation 平台 — 概念文档 v0.4") == "APAC L&D Simulation 平台"
    assert _clean_domain("Idea — 概念文档 v3") == "Idea"


def test_strips_english_version_suffix():
    assert _clean_domain("MyProduct — v0.4") == "MyProduct"
    assert _clean_domain("MyProduct -- version 3") == "MyProduct"
    assert _clean_domain("MyProduct — V2.1") == "MyProduct"


def test_strips_bracketed_status():
    assert _clean_domain("My Idea [DRAFT]") == "My Idea"
    assert _clean_domain("My Idea [WIP]") == "My Idea"
    assert _clean_domain("My Idea [v0.4]") == "My Idea"


def test_strips_trailing_emphasis_and_ellipsis():
    assert _clean_domain("**AgentMeter**") == "AgentMeter"
    assert _clean_domain("My idea...") == "My idea"
    # Use … escape — direct unicode literal gets mangled in some
    # Windows-encoded source files
    assert _clean_domain("My idea…") == "My idea"


def test_collapses_internal_whitespace():
    assert _clean_domain("Multi   space   noise") == "Multi space noise"
    assert _clean_domain("Tab\tspace\nthing") == "Tab space thing"


def test_caps_length_at_max_len():
    long = "X" * 100
    assert len(_clean_domain(long, max_len=60)) == 60
    assert len(_clean_domain(long, max_len=30)) == 30


def test_handles_empty_and_pure_noise():
    assert _clean_domain("") == ""
    assert _clean_domain("###") == ""
    assert _clean_domain("**") == ""


def test_preserves_meaningful_content():
    """Don't over-strip — real domain words must survive."""
    assert _clean_domain("Singapore banking compliance simulation") == "Singapore banking compliance simulation"
    assert _clean_domain("AI agents pay AI agents on Solana") == "AI agents pay AI agents on Solana"


# ---------------------------------------------------------------
# extract_search_queries — end-to-end with cleaned domain
# ---------------------------------------------------------------

def test_prove_debate_idea_with_markdown_noise_extracts_clean_domain():
    """Reproduce the 2026-05-08 SG-banking failure: the prompt embeds the
    full v0.4 markdown idea; without _clean_domain the templated queries
    carry "#" + version-doc Chinese suffix and Tavily returns junk.
    """
    prompt = """Round 1 / Phase A / Step 3: Synthesized Challenge

--- IDEA / INPUT ---
# APAC L&D Simulation 平台 — 概念文档 v0.4

> 状态：草稿，用于持续讨论。
--- END INPUT ---

Search for direct competitors of the Proposer's plan."""
    queries = extract_search_queries(prompt)
    assert queries, "should produce at least one query"
    for q in queries:
        # No leading '#' literal, no version doc suffix
        assert not q.startswith("#"), f"raw '#' leaked into query: {q}"
        assert "概念文档" not in q, f"version-doc suffix leaked: {q}"
        assert "v0.4" not in q, f"version literal leaked: {q}"
        # Clean domain should be present
        assert "APAC L&D Simulation" in q, f"domain stripped too aggressively: {q}"


def test_competitor_phase_uses_competitor_template():
    prompt = """Round 1 / Phase B: Competitor Search

--- IDEA / INPUT ---
AgentMeter — cost governance for AI agents
--- END INPUT ---

Search competitors and competitive landscape."""
    queries = extract_search_queries(prompt)
    assert queries
    # Competitor-phase template should fire (contains "comparison" or "alternatives")
    assert any("comparison" in q.lower() or "alternatives" in q.lower() or "pricing" in q.lower() for q in queries)


def test_returns_empty_on_unparseable_prompt():
    """No domain markers, no markdown headings → no queries (caller falls
    through to plain LLM call)."""
    queries = extract_search_queries("just a tiny prompt")
    assert queries == []


def test_short_idea_passes_through_cleanly():
    prompt = """--- IDEA / INPUT ---
AgentMeter
--- END INPUT ---

competitor search"""
    queries = extract_search_queries(prompt)
    assert queries
    for q in queries:
        assert q.startswith("AgentMeter") or "AgentMeter" in q
