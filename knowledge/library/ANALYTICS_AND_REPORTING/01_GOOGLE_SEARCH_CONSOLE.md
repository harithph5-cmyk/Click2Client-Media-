# Google Search Console API

| Field | Value |
|---|---|
| Document ID | BASHA-ANALYTICS-001 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED for Search Analytics and quotas (S13 and S14, both updated 2025-08-28). OAuth scopes, sitemaps and URL Inspection API request formats NOT yet read. |

## Facts
- **[FACT, S13]** Metrics: clicks, impressions, CTR, position. Dimensions include page, query, country, device; `searchAppearance` cannot be combined with other dimensions. Search `type` parameter (web, image, video ...) needs one query per type. Grouping by page vs property changes how metrics are calculated. Including page and query can drop some data.
- **[FACT, S13]** Max 25,000 rows per request (page with `startRow`); the API exposes at most 50K rows/day per search type, sorted by clicks. Data typically available after 2-3 days; find latest date by grouping by date over the last 10 days. Retention period not stated on that page.
- **[FACT, S14]** Search Analytics load quota (10-minute and 1-day windows): per site 1,200 QPM, per user 1,200 QPM, per project 40,000 QPM and 30,000,000 QPD. URL Inspection: per site 600 QPM and 2,000 QPD; per project 15,000 QPM and 10,000,000 QPD. Other resources: 20 QPS and 200 QPM per user. **Store these in config; they change.**

## Detection and decision
- Retrieve by single day or small ranges to respect quota (S13 suggests one day per query).
- Always record the date range actually returned and the latest data date.
- Interpret: clicks and impressions are Search Console's counts for Google Search, not your analytics sessions. CTR and position are averages and depend on grouping.
- Comparisons: use equal-length, like-for-like periods; account for seasonality and data delay.
- Never state a cause for a change without supporting evidence (technical changes, content changes, algorithm announcements are hypotheses to test).

## Execution
`retrieve_search_console_data` (PROPOSED) uses tenant OAuth consent (REQUIRES EXTERNAL APPROVAL). Read-only scope only; tokens stored encrypted, scoped per tenant.

## Verification
Row count and date range in output; totals cross-check with an aggregate query (aggregate and row-level sums can differ because of dropped data: S13 note on dimensions).

## Errors
Quota exceeded: back off, narrow the query, report partial data; 403: permission/property mismatch: stop and ask the owner to verify access.

## Test case TS-GSC-01
Request spans 400 days by page+query. Expect Basha to split by day/range, note the row cap, and report that data may be truncated.

## Sources
S13, S14.
