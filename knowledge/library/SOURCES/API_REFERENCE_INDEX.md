# API Reference Index

Values below were read on **2026-10-28**. They change: store in configuration, re-check on the "check by" date, and never hard-code in prompts.

| API | Auth | Key facts (source) | Quota facts (source) | Check by |
|---|---|---|---|---|
| Search Console API, Search Analytics | OAuth (scopes not yet verified) | metrics, dimensions, 25,000 rows/request, ~2-3 day freshness (S13) | per site/user 1,200 QPM; per project 40,000 QPM, 30,000,000 QPD; URL Inspection 600 QPM and 2,000 QPD per site (S14) | 2027-01-28 |
| GA4 Data API | OAuth / ADC (details not verified) | `runReport`, `batchRunReports`, `getMetadata`, `checkCompatibility`, realtime (S15) | Standard 200,000 tokens/day, 40,000/hour, 10 concurrent (S16) | 2027-01-28 |
| PageSpeed Insights API v5 | optional key | lab + field; field being moved to CrUX API (S17) | not read | 2027-01-28 |
| WordPress REST API | Application Passwords (HTTPS), cookie+nonce, plugin auth | Posts create/update/delete, statuses, `force` delete (S18, S19) | none documented on pages read | 2027-04-28 |
| IndexNow | key file ownership proof | single and batch (up to 10,000 URLs) submit; 200 = received, not indexed (S29) | 429 = too many requests (no number) | 2027-01-28 |
| Instagram content publishing | OAuth, `instagram_content_publish` etc. | container then publish, JPEG, public media URL (S26) | 100/24h vs 50 (inconsistent, S26) | 2026-12-28 |
| LinkedIn Posts API | OAuth `w_member_social`/`w_organization_social` | versioned headers, org roles (S33) | not on page; 429 documented | 2026-11-10 (sunset of 202511 on 2026-11-16) |
| YouTube Data API v3 | OAuth for writes | writes need user authorisation (S25) | default 10,000 units/day; cost values inconsistent (S25) | 2026-12-28 |
| Google Business Profile APIs | not documented on page read | overview only (S24) | not read | research needed |
| OpenAI function calling | API key | tools, strict mode, parallel calls (S30) | not read | 2026-12-28 |
| Anthropic tool use | API key | client/server tools, strict, tool_choice (S31) | not read | 2026-12-28 |
| Gemini API (used by live Baasha AI) | API key | grounded search has no quota on the project's free tier (observed 2026-10-28 via 429 with plain calls succeeding); daily free quota per model observed | observed, not from docs | recheck against Google docs |
