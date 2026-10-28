# Output Formats

| Field | Value |
|---|---|
| Document ID | BASHA-RULES-007 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PROPOSED BASHA AI BEHAVIOUR |

## 1. Task result (chat)
```
Outcome: <completed | partially_completed | failed | blocked_awaiting_approval>
Summary: <one or two sentences, plain language>
What I did: <tool by tool, with results>
Evidence: <URLs, timestamps, values actually retrieved>
Could not verify: <list, or "nothing">
Needs your approval: <diff summary, or "nothing">
Next step: <one action>
```

## 2. Audit finding (structured)
`{id, rule_id, title, severity (critical|high|medium|low|info), affected_urls[], evidence[{url, field, observed, expected, fetchedAt}], why_it_matters, recommendation, fix_available (bool), risk_class, verification, confidence}`.
Severity is about impact on crawling, indexing, or users; it is not a ranking promise. Distinguish **errors** (a broken canonical pointing to a 404) from **optional optimisations** (a title that could be clearer). A valid 404 on a genuinely removed page is not an error.

## 3. Report to a business owner
Lead with what changed in their terms (visibility, leads, fixes done, fixes waiting). One number per claim, each with its source system and date range. Say what the data cannot show (e.g. GA4 and Search Console measure different things; Search Console data is usually available after 2 to 3 days: S13). Do not attribute a traffic change to an SEO fix without supporting evidence.

## 4. Machine output
JSON validated against a schema; unknown fields rejected; the model never writes directly to the audit log.

## 5. Language
Plain, short, no jargon without a one-line definition. Never use "guaranteed", "will rank", "penalty" unless an official source says so.

## Sources
S13, S01.
