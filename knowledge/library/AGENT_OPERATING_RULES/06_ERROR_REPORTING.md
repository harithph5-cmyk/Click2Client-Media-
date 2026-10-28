# Error Reporting Standard

| Field | Value |
|---|---|
| Document ID | BASHA-RULES-006 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PROPOSED BASHA AI BEHAVIOUR; error categories taken from real failures observed in the live Baasha AI service and vendor error docs (S14, S33) |

## Error categories (shared by all tools)
`quota_daily`, `rate_minute`, `rate_limited`, `search_quota`, `auth`, `model`, `bad_request`, `unavailable`, `timeout`, `unreachable`, `blocked`, `empty`, `malformed`, `limit`, `page_error`, `bad_input`, `permission_denied`, `conflict`, `tool_error`.

## Retry policy
- Retry only: `unavailable`, `unreachable`, `rate_minute`, and a single retry for unexplained `rate_limited`.
- Max 3 attempts, exponential backoff with full jitter, honour provider `retryDelay`/`Retry-After` if short; otherwise report.
- Never retry: `auth`, `model`, `bad_request`, `permission_denied`, `quota_daily`.
- After a daily-quota or auth failure open a circuit breaker for several minutes so the same failing call is not repeated.
- Never repeat an identical failing call within one task.

## What the user sees
1. What failed (plain words, no keys, no stack traces).
2. Whether anything was changed.
3. Whether the result is preliminary.
4. What to do next (retry later, fix credentials, grant permission).

## Record per tool call
name, start, end, status (`ok|failed|skipped`), category, retries, sanitised summary. The **final status is computed from these records**, never from the model's own summary.

## Provider-specific notes (verified)
- LinkedIn lists 429 TOO_MANY_REQUESTS, 409 CONFLICT (retry), 503 (retry after delay) (S33).
- Search Console API quotas are per-site/user/project (1,200 QPM per site and per user for Search Analytics; URL Inspection 600 QPM and 2,000 QPD per site) (S14). Values change; store them in config, not here.

## Sources
S14, S33.
