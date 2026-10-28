# Basha AI: Tool Registry

| Field | Value |
|---|---|
| Document ID | BASHA-TOOLS-001 |
| Version | 0.1.0 |
| Created / reviewed | 2026-10-28 |
| Product module | Agent runtime, AI_AUTOMATION |
| Research status | PROPOSED BASHA AI BEHAVIOUR. API facts cited from S13, S14, S15, S16, S17, S18, S19, S26, S33 (verified 2026-10-28). |

**Status labels:** IMPLEMENTED, PARTIALLY IMPLEMENTED, PROPOSED, UNAVAILABLE, REQUIRES EXTERNAL APPROVAL.
**Honest baseline (2026-10-28):** the public Baasha AI web agent (Node, `server/baasha/`) implements only `web_search`, `fetch_page`, `calculate`, `current_datetime` and `write_report`, all read-only. **Nothing in the SEO/CMS/CRM list below is built.** Names marked PROPOSED are design targets, not capabilities.

## Conventions for every tool
- Input is validated against a JSON schema (strict mode where the model API supports it: S30, S31).
- Output: `{ok, data?, error?{category, message, retryable}, evidence?{url, fetchedAt, status}}`. A failure is `ok:false`; the model must never treat it as success.
- Every write tool takes `idempotency_key`, `tenant_id`, `dry_run` (default true in ASSISTED mode) and returns a `change_id` usable by `rollback_change`.
- Default timeout 30 s read / 60 s write; retries only for `retryable` errors, max 2, exponential backoff with jitter; no retry on 4xx auth/permission errors.
- Every call is audit-logged: tenant, task, tool, args hash (never secrets), result status, duration.

## Read-only tools
| Tool | Purpose | Key inputs | Risk | Permissions | Verification | Status |
|---|---|---|---|---|---|---|
| web_search | Find public pages (grounded Gemini, else keyless fallback) | query | LOW | none | sources must come from results | IMPLEMENTED (Baasha web) |
| fetch_page | Read one public page via SSRF-safe fetcher | url | LOW | none | status, final URL, size | IMPLEMENTED (Baasha web) |
| calculate | Exact arithmetic, no eval | expression | LOW | none | n/a | IMPLEMENTED |
| current_datetime | Date/time in a timezone | timezone | LOW | none | n/a | IMPLEMENTED |
| write_report | Save a Markdown report | title, markdown | LOW | none | report id returned; preliminary flag when evidence failed | IMPLEMENTED |
| crawl_website | Bounded crawl (respects robots.txt per RFC 9309, scope, page cap default 500, 1-2 req/s per host, backoff on 429/5xx, max 10 redirect hops recorded per URL; spec in TECHNICAL_SEO/02) | start_url, max_pages, scope | LOW | site ownership proof for large crawls | pages fetched/skipped, errors by category, caps hit (partial if any cap hit) | PROPOSED |
| render_page | Headless render for raw-vs-rendered diff (JS SEO) | url | LOW | none | rendered DOM hash, differences listed | PROPOSED |
| inspect_url | One URL: status, redirects, headers, canonical, robots meta, title, H1 | url | LOW | none | raw headers stored | PROPOSED |
| analyse_seo_metadata | Titles/descriptions/headings checks over crawl data | crawl_id | LOW | none | rule IDs referenced | PROPOSED |
| detect_broken_links | Internal/external link status check | crawl_id | LOW | none | recheck before reporting | PROPOSED |
| inspect_robots_txt | Fetch and parse robots.txt (RFC 9309 rules, S27) | host | LOW | none | exact bytes + status | PROPOSED |
| inspect_xml_sitemap | Parse sitemap, check URL status/canonical | sitemap_url | LOW | none | sample re-fetch | PROPOSED |
| inspect_canonical_tags | Compare declared vs observed canonical | crawl_id | LOW | none | n/a | PROPOSED |
| analyse_internal_links | Link graph, orphans, depth | crawl_id | LOW | none | n/a | PROPOSED |
| retrieve_search_console_data | Search Analytics query (rows, quota aware) | property, dates, dims | LOW | tenant OAuth to GSC | row counts, date range actually returned | PROPOSED; REQUIRES EXTERNAL APPROVAL (tenant OAuth consent) |
| retrieve_ga4_report | GA4 `runReport` | property, metrics, dims | LOW | tenant OAuth/service account | quota tokens used | PROPOSED, REQUIRES EXTERNAL APPROVAL |
| run_pagespeed | PSI API v5 lab (+field if present) | url | LOW | optional API key | returns both lab and field flags | PROPOSED |

## Generation tools (no external side effects)
| Tool | Purpose | Risk | Status |
|---|---|---|---|
| generate_seo_recommendations | Prioritised findings with evidence and severity | LOW | PROPOSED |
| generate_content_brief | Brief from intent + sources (cited) | LOW | PROPOSED |
| draft_customer_response | Draft reply from authorised business info | LOW (sending is separate) | PROPOSED |
| generate_client_report | Plain-language report from retrieved data | LOW | PROPOSED |
| create_social_content_draft | Draft posts per platform rules | LOW | PROPOSED |

## Write tools (need mode + approval policy)
| Tool | Purpose | Risk (starting class) | Permissions | Idempotency / rollback | Status |
|---|---|---|---|---|---|
| create_wordpress_draft | `POST /wp/v2/posts` with `status=draft` (S19) | MEDIUM | WP user with edit capability; Application Password over HTTPS (S18) | key per draft; delete draft via `rollback_change` (needs explicit force flag: S19 documents `force` for bypassing Trash) | PROPOSED |
| update_wordpress_metadata | Update title/slug/excerpt/core fields; SEO-plugin fields only if the plugin exposes them via REST (unverified) | MEDIUM | as above | store previous values (revisions are a separate endpoint, not verified here) | PROPOSED |
| publish_wordpress_post | Set `status=publish` | HIGH | as above + approval always in ASSISTED | revert to draft | PROPOSED |
| update_site_config (robots.txt, redirects, noindex, canonicals sitewide) | Technical site-wide changes | HIGH | tenant-granted, per-change approval | full backup first | UNAVAILABLE (do not build until backups/rollback exist) |
| schedule_approved_content | Publish at a time to a platform API | HIGH | per-platform approval (see below) | cancel schedule id | REQUIRES EXTERNAL APPROVAL |
| create_crm_lead | Create/update a CRM record | MEDIUM | connector scopes | dedupe key | PROPOSED (no CRM verified yet) |
| verify_website_change | Re-fetch and compare to expected state | LOW | none | n/a | PROPOSED |
| rollback_change | Reverse a recorded change | HIGH | same as original write | idempotent | PROPOSED |

## Platform publishing facts (verified, for planning only)
- **Instagram:** professional account; permissions `instagram_content_publish` (and variants); JPEG images; media must be on a public server; limit stated as 100 API-published posts per 24h, but the same page also states 50 for carousels, so treat the lower value as the working limit until clarified (S26).
- **LinkedIn Posts API:** requires `w_member_social` or `w_organization_social` (org roles ADMINISTRATOR etc.); headers `Linkedin-Version` and `X-Restli-Protocol-Version`; `r_member_social` is restricted to approved users; versions sunset (version 202511 sunsets 2026-11-16) (S33).
- **YouTube Data API:** inserts/updates/deletes always require OAuth user authorisation; default quota 10,000 units/day; the page states `videos.insert` at 1 unit but also that writes usually cost 50, so confirm against the quota calculator before relying on it (S25).
- **Pinterest, Reddit, Facebook Pages:** not verified (Pinterest docs URL returned 404 on 2026-10-28). Treat as UNAVAILABLE until researched.

## Maintenance
Update status labels only when code ships with tests. Re-check platform facts each quarter (SOURCES/API_REFERENCE_INDEX.md lists check dates).

## Implementation status update, Stage 1 (2026-10-28)
These agent tools exist in the Baasha AI web agent (`server/baasha/agenttools.js`) and are covered by tests (`test/baasha-stage1.test.js`, 27 tests). All are read-only (LOW risk). The agent has **no write tools**; anything above LOW risk is held for approval by the policy gate (`server/baasha/policy.js`), but no such tool is registered yet.
| Registry name | Implemented as | Status |
|---|---|---|
| crawl_website, inspect_url, analyse_seo_metadata, detect_broken_links, inspect_robots_txt, inspect_xml_sitemap, inspect_canonical_tags, analyse_internal_links | `audit_site` (home page only, plus robots, sitemap and security checks, rule engine, score, issues; multi-page crawl not available in agent audits) and `run_seo_tool` (21 live single-purpose tools such as meta-analyzer, heading-checker, robots-checker, sitemap-checker, canonical-checker, redirect-checker, broken-link-checker, schema-validator, internal-link-checker) | IMPLEMENTED (not one tool per name; no JS rendering, no PageSpeed field data in agent audits) |
| generate_content_brief | `run_seo_tool` with `content-brief-generator` | IMPLEMENTED (site tool) |
| retrieve knowledge | `search_knowledge`, `load_skill` | IMPLEMENTED (keyword search over this library; 3 skills) |
| run_pagespeed | site tool `core-web-vitals` through `run_seo_tool`; skipped inside `audit_site` | PARTIALLY IMPLEMENTED (needs a PageSpeed API key for field data) |
| retrieve_search_console_data, retrieve_ga4_report, create_wordpress_draft, update_wordpress_metadata, verify_website_change, rollback_change, schedule_approved_content, create_crm_lead, create_social_content_draft, draft_customer_response, generate_client_report | none | PROPOSED / REQUIRES EXTERNAL APPROVAL (not built) |
