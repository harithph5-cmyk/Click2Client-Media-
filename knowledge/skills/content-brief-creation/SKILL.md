---
id: content-brief-creation
name: Content brief creation
description: Produce a content brief (intent, headings, questions, entities) for a topic using the content-brief tool and the knowledge base.
triggers: [content brief, outline, blog outline, article plan, what to cover]
tools: [run_seo_tool, search_knowledge, write_report]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# Content brief creation

## Scope and non-goals
A brief for human writers. It does not write or publish the article and sets no word-count target.

## Required inputs
Topic or target keyword; audience and business context if known.

## Prerequisites
The tools named above are implemented and read-only.

## Procedure
1. Run `content-brief-generator` with the topic.
2. Cross-check headings with `search_knowledge` guidance on people-first content and AEO structure.
3. Add a "sources to check" section listing what a writer must verify; never fabricate statistics or quotes.
4. Save with `write_report` if asked.

## Approval and permissions
All steps are LOW risk and run without approval. Changing a website is not available; never say you changed anything.

## Verification
The brief contains only tool output and cited knowledge; unknowns are listed as questions for the owner.

## Failure handling
If a tool fails or is skipped, say so, do not retry an identical failing call, and mark any report preliminary.

## Output format
Findings with evidence, then what was not measured, then next steps in plain language.

## Test cases
- No invented statistics appear in the brief.

## Sources
knowledge/library/ON_PAGE_SEO/08_CONTENT_QUALITY.md.
