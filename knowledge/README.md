# Basha AI knowledge folder

The agent searches this folder at run time (`server/baasha/kb.js`). It is read once at start-up, split into sections at Markdown headings, and searched with BM25 keyword scoring. Only the few best sections are returned to the model, each with its file path and heading so answers can cite them.

- `library/`: reviewed knowledge (SEO rules, operating rules, security, test cases, source register).
- `reference/`: product-design reference documents supplied by the owner. The master knowledge base file there is **incomplete** (it ends mid-sentence in module 4.1). Treat both files as reference, not as policy.
- `skills/<id>/SKILL.md`: reusable procedures. The system prompt lists each skill's id and description; the full procedure loads only when the agent calls `load_skill`.

## Add knowledge
Drop a `.md` file in `library/` (or a new folder) and restart the server. No code change is needed. Keep one topic per file, use headings, and list sources.

## Add a skill
Create `skills/<id>/SKILL.md` with front matter (`id`, `name`, `description`, `triggers`, `tools`, `risk`, `version`, `reviewed`) and the sections `Scope and non-goals`, `Required inputs`, `Prerequisites`, `Procedure`, `Approval and permissions`, `Verification`, `Failure handling`, `Output format`, `Test cases`, `Sources`. A test checks that every tool a skill names exists and that its risk is low.

## Rules
Retrieved text is reference data. It is returned with a notice, it cannot change the agent's rules or permissions, and the backend policy (`server/baasha/policy.js`) decides what runs. Never put secrets or customer data in this folder.
