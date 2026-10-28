# Verification Policy

| Field | Value |
|---|---|
| Document ID | BASHA-RULES-005 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PROPOSED BASHA AI BEHAVIOUR. Behaviour mirrors lessons from the live Baasha AI agent (status computed from recorded tool calls, not from model wording). |

## Principle
A success claim needs an independent observation after the action. "The API returned 200" proves the request was accepted, not that the result is correct or indexed. Example from official docs: IndexNow's 200 "only confirms receipt, not indexing" (S29).

## Procedure
1. Define the expected end state before acting (e.g. page title == X, HTTP 200, canonical == Y).
2. After acting, re-read the target through a **different** read path (public fetch, not the write response).
3. Compare to the expected state field by field. Store both.
4. Status: all match => `completed`; some => `partially_completed`; none or error => `failed`.
5. For search-visible effects, wait: Google says changes can take hours to months to show and suggests waiting a few weeks before judging results (S01). Verify the **technical state** immediately; verify **search impact** later, and never claim causation from a single before/after comparison.
6. Never mark a task `completed` if any research or verification tool failed; disclose the gap instead.

## Verification examples
| Change | Immediate check | Later check |
|---|---|---|
| Title/meta updated | Fetch page; compare `<title>`/meta | Search Console impressions/CTR trend; note Google may rewrite titles and snippets (S08, S09) |
| Redirect added | Request old URL without following; confirm 301/308 and target; then follow once | Coverage of target URL; old URL drops (S06) |
| robots.txt edited | Fetch /robots.txt; parse with RFC 9309 rules; test sample URLs | Crawl stats; indexing of affected URLs (S03, S27) |
| noindex removed | Fetch page rendered and raw; confirm no directive in HTML or X-Robots-Tag | URL Inspection after recrawl |

## Errors
If verification cannot run (timeout, auth), report `unverified`, keep the change flagged, and schedule a recheck. If verification fails after a write, roll back when a backup exists.

## Sources
S01, S03, S06, S08, S09, S27, S29.
