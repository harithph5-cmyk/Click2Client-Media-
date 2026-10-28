---
id: search-intent-analysis
name: Search intent analysis
description: Classify queries as informational, navigational, commercial or transactional and suggest the page type that fits.
triggers: [search intent, intent, informational, transactional, commercial, what do people want]
tools: [run_seo_tool, search_knowledge]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# Search intent analysis

## Scope and non-goals
Classification of given queries. It does not claim to know what Google shows for them.

## Required inputs
One or more queries from the user.

## Prerequisites
The tools named above are implemented and read-only.

## Procedure
1. Run `search-intent-classifier` with the queries.
2. Explain each classification in plain language and the page format that usually fits.
3. Flag queries whose intent is mixed or unclear instead of forcing a label.

## Approval and permissions
All steps are LOW risk and run without approval. Changing a website is not available; never say you changed anything.

## Verification
Quote the tool output; mark classifications as rule-based estimates.

## Failure handling
If a tool fails or is skipped, say so, do not retry an identical failing call, and mark any report preliminary.

## Output format
Findings with evidence, then what was not measured, then next steps in plain language.

## Test cases
- Ambiguous query reported as mixed.

## Sources
knowledge/library/SEO_FUNDAMENTALS/01_SEO_FUNDAMENTALS.md.
