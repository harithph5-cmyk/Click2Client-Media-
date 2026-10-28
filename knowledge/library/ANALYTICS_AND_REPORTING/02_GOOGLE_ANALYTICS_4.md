# Google Analytics 4 Data API

| Field | Value |
|---|---|
| Document ID | BASHA-ANALYTICS-002 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED for overview and core quotas (S15, S16, both updated 2026-10-22). Auth scopes/service-account setup, sampling and attribution details NOT yet read. |

## Facts
- **[FACT, S15]** The Data API gives programmatic access to GA4 report data matching the Analytics interface; it does not work with legacy Universal Analytics properties; results follow the property's reporting identity setting. Methods: `runReport` (preferred for simple queries), `batchRunReports`, pivot reports, `getMetadata` (lists dimensions/metrics including custom), `checkCompatibility`, `runRealtimeReport` (last 30 minutes; 60 for 360 properties). Some methods (funnel reports, recurring audience lists) are marked early preview.
- **[FACT, S16]** Core quotas per property (Standard): 200,000 tokens/day, 40,000 tokens/hour, 10 concurrent requests; Analytics 360: 2,000,000/day, 400,000/hour, 50 concurrent. Per-project hourly cap 14,000 tokens (Standard). Store in config.

## Detection and decision
- Call `getMetadata` and `checkCompatibility` before building a report to avoid invalid dimension/metric combinations.
- Define each KPI with its GA4 name (sessions, engaged sessions, key events/conversions, revenue) and its source; do not equate Search Console clicks with GA4 sessions (different systems and definitions).
- Report data freshness and any thresholding or sampling the API reports [UNVERIFIED: response fields not read].
- Attribution: say which model/identity setting applies when known; otherwise say "not determined".

## Execution
`retrieve_ga4_report` (PROPOSED, REQUIRES EXTERNAL APPROVAL: tenant grants read access). Read-only. Token cost is tracked per call; stop when quota remaining is low.

## Verification
Echo the exact request (property ID masked, dates, metrics, dimensions) and the row count in the report; check a total with an aggregate query.

## Errors
Quota exhausted (`429`-style): back off; permission denied: ask owner to grant access to the right property; incompatible fields: fix query via `checkCompatibility`.

## Test case TS-GA4-01
Owner asks for "organic revenue" but the property has no ecommerce events. Expect Basha to say revenue data is not available, not return zero as if measured.

## Sources
S15, S16.
