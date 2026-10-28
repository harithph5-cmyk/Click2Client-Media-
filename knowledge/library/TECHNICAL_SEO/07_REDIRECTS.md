# Redirects

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-007 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S06 (Google redirects page, updated 2026-04-14). The page did **not** cover redirect chains; chain limits are NOT recorded as facts. |

## Facts [FACT, S06]
- Permanent: HTTP 301, 308; meta refresh or HTTP refresh with 0-second delay; JavaScript `location`; "crypto redirects" (a visible link).
- Temporary: 302, 303, 307; refresh with delay > 0.
- Permanent redirects signal the target should be canonical; temporary ones do not (source is typically shown).
- Server-side redirects are preferred (highest chance of correct interpretation). JavaScript redirects only if server-side is not possible, because rendering may fail.
- "Use permanent redirects when you're sure that the redirect won't be reverted."
- Sneaky redirects (different destination for crawlers vs users, to deceive) are spam (S02).

## Detection
Request each URL without following redirects; record each hop (status, Location, time); resolve the final URL; detect loops, chains (count hops), mixed protocol hops, redirects to 404, temporary codes used for permanent moves, JavaScript/meta redirects.

## Decision rules
1. Chain of more than one hop: **recommend** collapsing to a single hop. Treat as optimisation, not error, unless it breaks (loop, 404, timeout). **[FACT, S37]** Googlebot generally follows up to about 10 redirect hops, some tools follow none; 301/308 are a strong signal and 302/303/307 a weak one. Long chains also waste crawling on large sites (S40). The single-hop advice itself is a recommendation.
2. Redirect loop or redirect to 404: **high**.
3. A 404/410 for a genuinely removed page is valid; do not "fix" it by redirecting everything to the home page (soft-404 risk is not verified here; leave as recommendation to check).
4. Redirect rule changes are HIGH risk: need a mapping table, a backup of the current rules, staged rollout and approval.

## Execution
Not built (UNAVAILABLE). When built: apply at server/CDN or CMS plugin through a connector with dry run; never via client-side JavaScript unless no alternative.

## Verification
For every mapped URL: single hop, expected 301/308 and target; target returns 200 and is indexable; old URL no longer returns 200. Later monitor coverage of the target and crawl errors.

## Test cases
- TS-REDIR-01: A -> B -> C (301s). Expect chain finding with hop list and a one-hop recommendation.
- TS-REDIR-02: A -> A (loop). Expect `high`, no auto-fix.

## Limitations
Chain-length guidance, 307/308 caching behaviours and CDN specifics need further sources (MDN/HTTP RFC 9110 not yet read).

## Sources
S06, S02.
