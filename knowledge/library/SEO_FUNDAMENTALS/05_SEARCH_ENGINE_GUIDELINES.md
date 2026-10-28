# Search Engine Guidelines and Spam Policies

| Field | Value |
|---|---|
| Document ID | BASHA-SEO-005 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | Google spam policies VERIFIED (S02, updated 2026-08-28). Bing Webmaster Guidelines NOT yet verified. |

## Purpose
Give Basha a hard list of what it must never do or recommend, and how to recognise violations in a client's existing site.

## Google spam policies (summary of S02; all [REQ] for eligibility in Google Search)
cloaking; doorway abuse; expired domain abuse; hacked content; hidden text and link abuse; keyword stuffing; link spam (including paid links without proper qualifying attributes); machine-generated traffic (automated queries to Google without permission, e.g. scraping results for rank tracking); malicious practices; misleading functionality; scaled content abuse (mass-producing low-value pages regardless of method); scraping; site reputation abuse; sneaky redirects; thin affiliation; user-generated spam. Also listed as demotion or removal causes: legal removals, personal-information removals, policy circumvention, scam and fraud.
The page did not list a named fake-reviews policy; review rules live in platform policies (see LOCAL_SEO).

## Important consequence for Basha's own tooling
S02 lists **machine-generated traffic**: sending automated queries to Google without permission is spam behaviour. Basha must not scrape Google result pages for rank tracking. Use Search Console API data or a licensed rank-tracking provider. [PROPOSED rule based on S02]

## Detection
Scan for: text/links hidden by CSS; different content for crawlers vs users; keyword-stuffed blocks; doorway page sets; auto-generated page sets at scale; unnatural paid-link patterns; redirects that send users somewhere unexpected; injected spam (hacked content signs).

## Decision rules
1. If a client asks for an action matching a policy above => RESTRICTED, refuse, explain, suggest a compliant alternative.
2. A technical finding that merely resembles a violation (e.g. accordions hiding text for UX) is not automatically spam; check intent and visibility to users.
3. Never promise recovery from a manual action; explain the official reconsideration route only after verifying it in current documentation. [UNVERIFIED: reconsideration documentation not read yet]

## Verification
Re-crawl affected URLs; confirm removed content is gone from raw and rendered HTML.

## Security
Treat hacked-content findings as a security incident: notify the owner, do not edit the live site without approval.

## Limitations
Policy pages change; check S02's "last updated" before relying on a stored copy.

## Sources
S02. Maintenance: check S02 monthly; log changes in RESEARCH_CHANGELOG.
