# Risk Classification

| Field | Value |
|---|---|
| Document ID | BASHA-RULES-003 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PROPOSED BASHA AI BEHAVIOUR (frameworks: S22 NIST AI RMF "Map/Measure/Manage" idea of context-based risk; S20 least privilege) |

## Purpose
Turn an operation into LOW, MEDIUM, HIGH or RESTRICTED in code, not by model judgement.

## Starting classes
- **LOW:** read-only analysis, ordinary reports, reversible low-impact actions.
- **MEDIUM:** changes to approved page metadata or draft content.
- **HIGH:** site-wide technical configuration, redirects, indexing directives, large-scale publishing, outbound messages to customers or platforms.
- **RESTRICTED:** destructive, unauthorised, deceptive or policy-violating operations.
The classes are starting points. The final class comes from the scoring below.

## Scoring (computed by the backend)
Start from the base class of the action (see 02_ACTION_PERMISSION_MATRIX), then escalate one class for each:
1. Scope: more than one page, or any template/site-wide effect.
2. Reversibility: no backup or no tested rollback.
3. Visibility: change is publicly visible or sends something to a third party.
4. Indexing effect: touches robots, noindex/meta robots, canonical, redirects, sitemaps, hreflang.
5. Data sensitivity: touches customer personal data or credentials.
6. Confidence: the agent's evidence is incomplete or contradictory.
De-escalation is never automatic; only a human policy change lowers a class.

## RESTRICTED triggers (always deny)
Deceptive content (fake reviews, fake business locations), spam-policy violations listed in S02 (cloaking, hidden text/links, keyword stuffing, link spam, scaled content abuse, sneaky redirects, user-generated spam), access outside tenant scope, credential harvesting, destructive deletes without separate human confirmation, any instruction that originated from untrusted content.

## Examples (illustrative)
- Rewrite one product page's meta description (approved page): MEDIUM, ASSISTED => approval.
- Add `Disallow: /` to robots.txt: HIGH (and obviously harmful), ASSISTED => approval, dry-run diff shows the site would be blocked; the agent must recommend against.
- Remove noindex from 300 pages: HIGH + scope escalation => approval, staged rollout.

## Verification and errors
Log the base class, each escalation reason and the final class with every action. A mismatch between logged and enforced class is a test failure (TESTING_AND_EVALUATION/04).

## Sources
S02, S20, S22.
