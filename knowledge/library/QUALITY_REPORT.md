# Knowledge Base Quality Report (batches 1 and 2)

Date: 2026-10-28 · Library version 0.2.0 · **Status: PARTIAL. Roughly a third of the planned structure exists (49 content/registry files plus this report); the rest is explicitly marked planned.**

**Batch 2 additions:** technical audit framework with a 26-rule register (one rule, SEC-HTTPS-001, is marked unverified), website crawling design, HTTP status codes, indexability, broken links, headings, internal linking, image SEO, crawl/index/serve fundamentals, and 33 fully specified test cases. 12 more sources (S36-S47) were read. Checks re-run after batch 2: 50 files; all 47 source IDs used are in the register; every `TS-` test ID referenced in any file is defined (after de-conflicting ROBOTS and CANON IDs) except the ones explicitly listed as planned (CONTENT, CWV, GA4, GSC, HREFLANG, INJ, ISO, LOCAL, SCHEMA, SOC, SSRF, WP); no key-like strings found. The figures below describe batch 1 and are partly superseded.

## 1. What the library covers
40 Markdown files: master index; master system instructions; tool registry (with honest status labels); retrieval/RAG design; the full operating-rules set (modes, permission matrix, risk classes, approval, verification, error reporting, output formats); SEO fundamentals and spam policies; titles, meta descriptions, content quality, structured data; robots.txt, sitemaps, canonicals, redirects, JavaScript SEO, Core Web Vitals, hreflang; Search Console and GA4 data access; WordPress REST integration; Google Business Profile guidelines; social publishing facts; function calling; authorisation, prompt injection and SSRF security; a testing framework with metric definitions; known limitations; five source indexes and a changelog.

## 2. Sources verified
35 pages (S01-S35) were opened on 2026-10-28 through a fetch tool that returns **summaries**, not raw text. Facts are therefore "read via summary"; exact wording must be re-checked before quoting. Three fetches redirected or failed and are recorded as such. Page dates are recorded where shown; several pages show none.

## 3. Checks run on the files
- 39 files existed at check time (the 40th is this report). Every source ID used in the files (S01-S35) exists in the register, and every register row is used.
- A scan for key-like strings (generic API-key patterns, `AIza...`, `sk-...`) found none.
- Cross-file consistency was checked by reading: robots.txt (not an exclusion mechanism), canonical (signal, not directive), title/meta length (no official limit), risk rules (indexing changes are HIGH) agree across files. No automated consistency tool was run.
- Not checked: link liveness of every URL beyond the fetches above; spelling; whether instructions produce good agent behaviour (no agent was tested against these documents).

## 4. Areas still requiring research (blocking for related files)
Bing Webmaster; W3C/WCAG; schema.org and Google's feature-specific structured-data docs; web.dev/Chrome/MDN/WHATWG; sitemap protocol limits; Google robots.txt specification; GBP API reference, quotas and review policy; Maps Platform; Tag Manager; Looker Studio; OWASP Top 10 and API Top 10; NIST SSDF and cloud/database security docs; PostgreSQL search/vector docs; Meta Pages, Pinterest, Reddit docs; CRM/email/scheduling vendor APIs; backlink-data providers; academic work on GEO/AEO and retrieval evaluation.

## 5. What needs software (not knowledge)
Crawler and renderer; inspect/analysis tools; Search Console and GA4 connectors with OAuth; WordPress connector with backups and rollback; approval service; task-state store; permission engine; audit log; evaluation harness; tenant isolation. **None of the SEO/CMS/CRM tools exist yet.** Only the web research/agent tools in the Baasha AI site (search, page fetch, calculator, date/time, report) are implemented.

## 6. What needs third-party access or approval
Tenant OAuth for Search Console, GA4, Google Business Profile; WordPress Application Passwords per site; Meta, LinkedIn, YouTube app permissions and reviews (specifics unverified for some); paid backlink or rank data providers.

## 7. Suggested build order
1. Read-only audit: `inspect_url`, `crawl_website`, robots/sitemap/canonical/redirect checks, findings format (needs no external approvals).
2. Task state, audit log, permission matrix and approval service in the backend.
3. Search Console and GA4 read connectors and the report generator.
4. WordPress connector in draft-only mode with backup and rollback, then metadata updates.
5. Evaluation harness with fixture sites before adding any new write tool.
6. Social drafting before publishing; CRM last.

## 8. Before production
Passing tests for: permission denial, tenant isolation, injection and SSRF cases, idempotent retries, rollback, verification failures, quota handling; a red-team set showing 100% prevention of unauthorised actions; a retrieval evaluation on real queries; review of every PARTIAL document's unverified claims.

## 9. Honest verdict
Useful as a verified starting library and as the specification for the agent's rules and tool contracts. **Not** a finished knowledge base, and not evidence that Basha can perform these tasks.
