---
id: internal-linking
name: Internal linking review
description: List a page's internal links, find empty anchors and nofollow links, and suggest natural contextual links.
triggers: [internal links, internal linking, orphan page, anchor text, link structure]
tools: [run_seo_tool, search_knowledge]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# Internal linking review

## Scope and non-goals
One page at a time. A site-wide link graph needs a multi-page crawl, which is not available in agent tasks.

## Required inputs
The page URL.

## Prerequisites
The tools named above are implemented and read-only.

## Procedure
1. Run `internal-link-checker` on the URL.
2. Report empty anchors, generic anchors and nofollow internal links with evidence.
3. Use `search_knowledge` (ON_PAGE_SEO/06) for guidance; suggest at most a few links, each with a real reason for readers.
4. Do not claim orphan pages from one page; say a multi-page crawl is needed.

## Approval and permissions
All steps are LOW risk and run without approval. Changing a website is not available; never say you changed anything.

## Verification
Quote link counts and examples from the tool.

## Failure handling
If a tool fails or is skipped, say so, do not retry an identical failing call, and mark any report preliminary.

## Output format
Findings with evidence, then what was not measured, then next steps in plain language.

## Test cases
- Single page cannot establish orphan pages: stated.

## Sources
knowledge/library/ON_PAGE_SEO/06_INTERNAL_LINKING.md.
