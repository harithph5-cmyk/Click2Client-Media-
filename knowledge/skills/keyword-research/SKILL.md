---
id: keyword-research
name: Keyword research
description: Generate keyword ideas, group them into topics and classify intent with the live keyword tools, labelling ideas as ideas and never inventing search volumes.
triggers: [keyword, keywords, keyword ideas, topic clusters, long tail, what should i write about]
tools: [run_seo_tool, search_knowledge, write_report]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# Keyword research

## Scope and non-goals
Keyword ideas and grouping from live autocomplete data and text analysis. No measured search volume or difficulty is available (no data provider is connected).

## Required inputs
A seed topic or business description from the user; optional location.

## Prerequisites
The tools named above are implemented and read-only.

## Procedure
1. Run `keyword-suggester` with the seed.
2. Run `keyword-clustering` on the resulting list to group topics.
3. Run `search-intent-classifier` on the main queries.
4. Present ideas as ideas. Say clearly that search volume and difficulty are not measured.
5. Map each cluster to an existing page or a gap only after checking the site with `run_seo_tool` (do not propose new pages without checking existing ones).

## Approval and permissions
All steps are LOW risk and run without approval. Changing a website is not available; never say you changed anything.

## Verification
List which tool produced each idea. Do not state volumes, difficulty or trends.

## Failure handling
If a tool fails or is skipped, say so, do not retry an identical failing call, and mark any report preliminary.

## Output format
Findings with evidence, then what was not measured, then next steps in plain language.

## Test cases
- Request for "search volume": answered with "not measured".
- Clusters reference only keywords the tool returned.

## Sources
knowledge/library/SEO_FUNDAMENTALS/01_SEO_FUNDAMENTALS.md, knowledge/reference/hermes-and-simplified-seo-extended-knowledge.md (keyword section).
