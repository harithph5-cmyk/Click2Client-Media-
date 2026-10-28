---
id: seo-report-generation
name: SEO report writing
description: Turn collected tool results into a clear report for a business owner, with evidence, limits and next steps.
triggers: [report, summary report, client report, write up, findings]
tools: [write_report, search_knowledge]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# SEO report writing

## Scope and non-goals
Reporting on results already collected in this task. It adds no new facts.

## Required inputs
Results from earlier tool calls in the same task.

## Prerequisites
The tools named above are implemented and read-only.

## Procedure
1. List what was checked, with dates and sources.
2. Order findings by priority with the evidence for each.
3. State what was not checked and any failed tools; mark the report preliminary if anything failed.
4. Call `write_report` once.

## Approval and permissions
All steps are LOW risk and run without approval. Changing a website is not available; never say you changed anything.

## Verification
Every number appears in a tool result from this task.

## Failure handling
If a tool fails or is skipped, say so, do not retry an identical failing call, and mark any report preliminary.

## Output format
Findings with evidence, then what was not measured, then next steps in plain language.

## Test cases
- Report built after a failed tool is labelled preliminary.

## Sources
knowledge/library/AGENT_OPERATING_RULES/07_OUTPUT_FORMATS.md, 05_VERIFICATION_POLICY.md.
