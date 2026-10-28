# Known Limitations Register

| # | Limitation | Impact | Status |
|---|---|---|---|
| L1 | Most SEO/CMS/CRM tools in the registry are PROPOSED, none built | Basha cannot yet execute site changes | open |
| L2 | Bing, W3C/WCAG, schema.org, web.dev, MDN, WHATWG, OWASP Top 10/API Top 10, NIST SSDF, PostgreSQL docs not read | Related docs are marked partial or planned | open |
| L3 | Google sitemap size limits and robots.txt syntax details not recorded | Basha must not state limits as facts | open |
| L4 | Redirects page (S06) does not cover chains; S37 gives about 10 hops for Googlebot; no official "ideal" chain length exists | Chain advice stays a recommendation; limit of 10 is Googlebot behaviour, not a target | partly resolved 2026-10-28 |
| L13 | Heading guidance rests on a 2017 W3C tutorial and an indirect Google statement; current WCAG and any Google heading page unread | Heading findings kept `low`, accessibility framing | open |
| L14 | Network/DNS error handling and Googlebot's crawl-rate numbers not documented in pages read; lazy-loading and image-sitemap detail unread | Do not state them as facts | open |
| L15 | SEC-HTTPS-001 (mixed content/HTTPS) rule has no researched premise | marked UNVERIFIED in the rule register | open |
| L5 | Google Business Profile API capabilities, quota and access approval unverified | Do not promise automation | open |
| L6 | Pinterest, Reddit, Facebook Pages unresearched (Pinterest URL 404) | Treat as unavailable | open |
| L7 | Instagram and YouTube pages contain inconsistent limit/quota statements | Use conservative values; verify with official calculators | open |
| L8 | Fetch tool returns summaries, not raw text | Quote nothing without re-reading the page | open |
| L9 | GEO/AEO effectiveness unverified; no academic papers researched yet | Label as experimental | open |
| L10 | Retrieval design (chunk size, embeddings, rerank) not evaluated | Engineering proposal only | open |
| L11 | Pricing and model catalogues intentionally not recorded | Check provider pages at integration time | by design |
| L12 | Google E-E-A-T wording in S01 summary conflicts in emphasis with S12 | Re-read both pages before quoting | open |
