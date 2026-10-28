# Testing and Evaluation Framework

| Field | Value |
|---|---|
| Document ID | BASHA-TEST-001 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PROPOSED BASHA AI BEHAVIOUR. Test cases already written in the topic files are indexed below; full per-case specs (initial state, inputs, expected tool calls, etc.) are PLANNED. |

## Test layers
1. **Unit tests** for tools (schema validation, parsers, SSRF checks, retry/limit logic) with mocked providers: deterministic, no quota. The live Baasha AI web agent already follows this pattern (see its `test/` folder: 124 tests passing on 2026-10-28 in that project, which is a separate codebase from the full Basha product).
2. **Fixture sites** (static HTML sites with seeded defects) for audit tools, so expected findings are known.
3. **Scripted-model scenario tests:** a fake model returns fixed tool calls to test the orchestrator, status computation, approvals and rollback.
4. **Live smoke tests** with real providers, run rarely, with budget caps; failures from external quota are reported as blocked, not as code failures.
5. **Security tests** (injection, SSRF, tenant isolation, secrets).

## Full specifications
`02_SEO_TEST_CASES.md` holds 33 fully specified crawl, status, metadata, heading, link, redirect, canonical, indexability, robots, sitemap and image cases (specifications only; nothing has been executed).

## Test case index (defined in the topic files)
TS-ROBOTS-01, TS-CANON-01, TS-REDIR-01/02, TS-CWV-01, TS-HREFLANG-01, TS-TITLE-01, TS-META-01, TS-SCHEMA-01, TS-CONTENT-01, TS-GSC-01, TS-GA4-01, TS-WP-01..03, TS-INJ-01..03, TS-SSRF-01..04, TS-LOCAL-01, TS-SOC-01..03.
**Planned (not written):** missing/duplicate titles at crawl scale, heading problems, broken internal links, sitemap errors, indexability combinations, slow-page batches, internal-linking and duplicate-content cases, interrupted tasks, duplicate execution, payment verification failures, tenant isolation (TS-ISO-01..04), incorrect reporting, hallucination traps.

## Required fields for each full test case (template)
ID, scenario, initial state (fixture), inputs, expected tool calls (names and order), expected findings (rule IDs), expected decision (class, approval), expected execution result, expected verification, expected report text checks, failure conditions, security notes.

## Metrics (definitions)
- **Issue-detection precision** = true findings / all findings reported (against a labelled fixture).
- **Recall** = true findings / all seeded defects.
- **False-positive rate** = false findings / all findings.
- **Tool-call success rate** = successful calls / calls attempted, by tool and by error category (external quota failures separated).
- **Task completion rate** = tasks with status `completed` / tasks started (report `partially_completed` and `failed` separately).
- **Verification success rate** = changes whose post-change check matched the expected state / changes applied.
- **Unauthorised-action prevention rate** = blocked unauthorised attempts / unauthorised attempts in the red-team set (target must be 100%; any miss is a release blocker).
- **Mean task completion time**, **cost per completed task** (model + tool charges / completed tasks), **human intervention rate** (tasks needing manual approval or rescue / tasks).
No single "reliability score" is computed; each metric is reported with sample size.

## Release gates (proposal)
No write tool ships without: unit tests, a fixture scenario, a rollback test, a permission-denied test, an idempotent-retry test, and an injection test on its inputs.

## Sources
Internal design; S20 (adversarial testing), S22 (measurement as part of risk management).
