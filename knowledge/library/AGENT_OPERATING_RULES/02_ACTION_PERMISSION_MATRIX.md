# Action Permission Matrix

| Field | Value |
|---|---|
| Document ID | BASHA-RULES-002 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Module | Agent operating rules |
| Research status | PROPOSED BASHA AI BEHAVIOUR. Principles from S20 (least privilege, human approval for high-risk actions), S23 (scope minimisation), S22 (risk management). Not a platform rule. |

## Purpose
One table the **backend** uses to decide whether an action may run in each mode. The model can propose; only this matrix plus tenant settings decide.

## Modes
- **AUDIT:** read-only. No writes anywhere.
- **ASSISTED:** the agent prepares changes as a diff or draft. LOW risk runs automatically; MEDIUM and above wait for a named human's approval.
- **AUTONOMOUS:** only actions on the tenant's explicit allowlist, within per-day limits; HIGH always needs approval unless the tenant allowlisted that exact action and scope in writing; RESTRICTED never.

## Matrix (starting classes; final class is computed per operation, scope and impact)
| Action | Risk | AUDIT | ASSISTED | AUTONOMOUS |
|---|---|---|---|---|
| Crawl, inspect URL, read GSC/GA4, generate reports | LOW | allow | allow | allow |
| Generate content/brief/draft text (not saved to a site) | LOW | allow | allow | allow |
| Save draft post to CMS | MEDIUM | deny | approve | allow if allowlisted |
| Update title/meta description on a named page | MEDIUM | deny | approve | allow if allowlisted, max N pages/day |
| Update body content of an existing live page | MEDIUM-HIGH | deny | approve | approve |
| Publish a post / bulk publish | HIGH | deny | approve | approve (bulk always) |
| Change robots.txt, noindex/meta robots, canonical rules, redirects, sitemap config, site-wide templates | HIGH | deny | approve + backup + dry run | approve + backup + dry run |
| Post to social platforms | HIGH | deny | approve | approve unless allowlisted per account |
| Send customer email / reply to review | MEDIUM-HIGH | deny | approve | approve |
| Create/update CRM lead | MEDIUM | deny | approve | allow if allowlisted |
| Delete anything (page, post, media, record), force-delete | RESTRICTED by default | deny | deny unless explicit per-item human confirmation outside the model | deny |
| Create fake reviews, fake locations, mass spam links or comments, cloaking, hidden text, scaled low-value content, fake engagement | RESTRICTED (S02 spam policies; S34) | deny | deny | deny |
| Access another tenant's data, bypass login/CAPTCHA, scrape private data | RESTRICTED | deny | deny | deny |

## Decision rules
1. Missing permission or unknown tenant scope => deny and report; never try an alternative credential.
2. A change touching more than a tenant-set number of URLs is escalated one class.
3. Anything affecting indexability (robots, noindex, canonical, redirects) is HIGH regardless of how small it looks (S03: robots.txt controls crawling; S05/S06: canonical and redirect signals change which URL is shown).
4. Approval is bound to the exact diff shown (hash). If the plan changes, approval is void.
5. Approvals expire (default 24 h) and are single-use.

## Verification, errors, security
Every allowed write ends with `verify_website_change`. On failure the backend attempts rollback if a backup exists and reports `partially_completed` or `failed`. Approval records, the approver identity and the diff hash are audit-logged.

## Limits
Thresholds (N pages/day, expiry) are proposals to be tuned with real tenants; there is no external standard for them.

## Sources
S02, S03, S05, S06, S20, S22, S23, S34.
