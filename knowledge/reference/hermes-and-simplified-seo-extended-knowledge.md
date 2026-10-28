# BASHA AI --- Extended Knowledge: Hermes Agent + Simplified SEO Tools Reference

**Version:** 1.0\
**Prepared:** 28 October 2026\
**Purpose:** Extend the Basha AI master knowledge base using publicly
available documentation for Hermes Agent and the tool catalogue on
Simplified SEO Tools.

## Important source distinction

This is an independent product-design and engineering reference informed
by public websites. It is not affiliated with, endorsed by, or a
reproduction of either referenced product. It describes patterns Basha
can implement, not capabilities that already exist in Basha. Verify
current official documentation before implementation.

**Reference websites** - Hermes Agent documentation:
https://hermes-agent.nousresearch.com/docs - Hermes Agent feature
overview:
https://hermes-agent.nousresearch.com/docs/user-guide/features/overview -
Hermes Agent tools:
https://hermes-agent.nousresearch.com/docs/user-guide/features/tools -
Hermes Agent skills:
https://hermes-agent.nousresearch.com/docs/user-guide/features/skills -
Hermes Agent memory:
https://hermes-agent.nousresearch.com/docs/user-guide/features/memory -
Hermes Agent security:
https://hermes-agent.nousresearch.com/docs/user-guide/security -
Simplified SEO Tools: https://simplifiedseotools.com/

------------------------------------------------------------------------

# PART A --- What Basha AI Can Learn from Hermes Agent

## A1. Product pattern: a persistent agent, not just a chat window

Hermes Agent's public documentation describes a tool-using agent with
persistent memory, reusable skills, browser and terminal tools,
scheduled tasks, delegated subagents, plugins/MCP integrations and
multiple ways to interact with it. Basha can use these as architectural
reference patterns, while keeping its own product scope focused on SEO
and business growth.

### Basha design requirements

Basha should separate these concerns:

1.  **Conversation interface:** The user's chat, task history, progress
    and result.
2.  **Planner/orchestrator:** Breaks a request into explicit steps and
    chooses suitable workflows.
3.  **Skills/workflows:** Reusable, versioned procedures for tasks such
    as technical audits or metadata updates.
4.  **Tool gateway:** Backend-controlled functions for crawling,
    analytics, WordPress, reporting and communication.
5.  **Memory and project context:** Approved business profile, project
    conventions and relevant past task outcomes.
6.  **Scheduler:** Runs user-approved recurring jobs.
7.  **Delegation:** Optional specialist tasks with limited tools and
    isolated context.
8.  **Policy/security layer:** Authorisation, approvals, budget limits,
    audit logging and verification.
9.  **Observability:** Task status, execution trace, errors, cost and
    result quality.

These should be independently testable modules. Do not create multiple
agents merely to imitate a product's appearance; use subagents only when
parallel work or separate context provides a clear benefit.

## A2. Skills as procedural knowledge

Hermes documents an on-demand skill system with progressive disclosure:
a brief description can be selected first, and the full procedure loaded
only when needed. Basha should adopt a similar pattern.

### Recommended Basha skill format

Each skill should live in its own directory:

``` text
skills/
  seo-technical-audit/
    SKILL.md
    references/
      status-codes.md
      canonicals-and-indexing.md
    templates/
      audit-report.md
    scripts/
      validate-crawl-results.py
  wordpress-metadata-update/
    SKILL.md
    references/
      wordpress-fields.md
    templates/
      change-preview.md
  monthly-seo-report/
    SKILL.md
    templates/
      monthly-report.md
```

Only create scripts when they are implemented, reviewed and tested. Do
not present a pseudocode example as an executable production tool.

### Required `SKILL.md` fields

-   Name and stable identifier
-   Short description and trigger conditions
-   Scope and non-goals
-   Required inputs
-   Prerequisite integrations
-   Procedure
-   Available tools and their expected inputs/outputs
-   Approval and permission requirements
-   Verification steps
-   Failure handling
-   Output format
-   Test cases
-   Version and review date
-   Source references

### Skill execution procedure

1.  Match the user task to a skill description.
2.  Confirm that the skill applies to the requested scope.
3.  Load the skill and only the reference material needed.
4.  Check required inputs and tool availability.
5.  Plan steps with dependencies.
6.  Execute read-only steps first.
7.  Request approval before restricted side effects.
8.  Verify results.
9.  Save reusable lessons only after checking they are correct and
    non-sensitive.
10. Propose a skill improvement when a repeatable issue is discovered;
    do not silently weaken safety rules.

## A3. Memory design

Hermes documents persistent memory with distinct user/profile and
agent/environment notes. Basha should also separate durable memory from
raw task history and client data.

### Basha memory layers

**1. Workspace profile** - Business facts, services, geography, brand
voice and goals. - Owner-approved facts and last-confirmed date. -
Stored separately for each client/workspace.

**2. Project/environment memory** - Connected CMS type, supported
fields, site conventions and known integration limitations. - Store no
credentials or secrets in this memory.

**3. Procedural skills** - Reusable task procedures and verified
workarounds. - Version controlled and tested before broad reuse.

**4. Task state** - Current job, current step, progress, retries,
approval status and tool operation IDs. - Structured database state, not
just conversational memory.

**5. Action history** - Before/after values, actor, timestamps,
operation status, verification and rollback reference. - Immutable or
tamper-evident where practical.

**6. Conversation history** - Searchable history for relevant context,
subject to retention and privacy controls. - Retrieve only the minimum
context needed.

### Memory quality rules

-   Save only durable, useful and authorised facts.
-   Record source and confidence for business facts.
-   Distinguish user-provided information from observed data.
-   Do not save passwords, API keys or access tokens.
-   Do not merge information between clients.
-   Provide a way for users to review and correct business profile
    facts.
-   Apply retention/deletion policy to conversations and task data.
-   Do not let an untrusted webpage update long-term memory or agent
    policy automatically.

## A4. Tool registry and least-privilege toolsets

Hermes documentation describes tools grouped by capability and tools
that can be enabled/disabled. Basha should implement a comparable
allowlisted registry, but with stricter product-specific scope.

### Suggested Basha tool groups

  -----------------------------------------------------------------------------
  Tool group              Example functions             Default access
  ----------------------- ----------------------------- -----------------------
  Website inspection      `crawl_site`, `fetch_page`,   Read-only
                          `check_http_status`           

  SEO analysis            `extract_metadata`,           Read-only
                          `check_canonicals`,           
                          `parse_sitemap`               

  Search analytics        `get_search_console_report`   Read-only, connected
                                                        account

  Performance             `get_pagespeed_report`        Read-only

  CMS                     `get_wordpress_page`,         Read-only by default;
                          `update_wordpress_metadata`   write gated

  Content                 `draft_content`,              Draft only
                          `check_content_quality`       

  Reporting               `generate_audit_report`,      Workspace scoped
                          `export_report`               

  Scheduling              `create_audit_schedule`,      Owner-authorised
                          `pause_schedule`              

  Notifications           `draft_notification`,         Draft first; sending
                          `send_notification`           gated

  Agent management        `create_task`,                Restricted internal
                          `delegate_subtask`            operations
  -----------------------------------------------------------------------------

Each function must be implemented in the backend and registered with a
strict input/output schema. Tool descriptions are not a substitute for
enforcement.

### Tool call contract

Every call should include or derive: - Authenticated workspace and
actor - Allowed operation - Validated target resource - Validated
arguments - Risk level - Approval token/record where required - Timeout
and quota - Idempotency strategy - Operation ID - Result and
verification state

The model must not be able to choose an arbitrary workspace ID to escape
tenant boundaries. The backend derives the workspace from authenticated
context.

## A5. Planning, subagents and delegation

Hermes supports task delegation and parallel work. Basha may use
specialist tasks for large audits, but must not delegate uncontrolled
access.

### Suitable parallel work

-   Crawl analysis for different URL batches
-   Separate analysis of on-page, technical and content findings
-   Independent report quality review
-   Researching official documentation for separate modules

### Unsuitable delegation

-   Two agents changing the same page simultaneously
-   Multiple agents editing global SEO settings without a shared
    approval record
-   Agents sharing unrestricted credentials
-   Parallel tasks that can duplicate non-idempotent external actions
-   Agents that can approve their own high-risk operations

### Delegation contract

Each child task receives: - Narrow task goal - Minimum required
context - Allowed tools - Read/write permission scope - Budget and time
limit - Expected output schema - Prohibited actions - Completion and
verification requirements

The parent agent validates the child's evidence and output before using
it. A subagent's statement is not proof that an external action
succeeded.

## A6. Scheduled automation

Hermes documents scheduled jobs. Basha should support recurring SEO jobs
only after job ownership, permissions, failure notifications and
cancellation are implemented.

### Useful schedules

-   Weekly read-only technical crawl
-   Weekly monitoring of selected Search Console metrics
-   Monthly SEO report
-   Monitoring for newly broken pages or sitemap errors
-   Monthly review of unresolved recommendations

### Scheduler safety

-   The user chooses cadence and scope.
-   Jobs have a workspace owner and unique job ID.
-   Store schedule timezone explicitly.
-   Enforce URL, API and model-cost quotas.
-   Prevent overlapping runs or define safe concurrency.
-   Send a clear failure notification.
-   Allow pause, resume, edit and delete.
-   Expire or revalidate credentials safely.
-   Never run an autonomous write job unless that exact action is
    pre-authorised.
-   Record each run, inputs, results and verification.
-   Do not send repetitive notifications for the same unresolved issue
    unless configured.

## A7. Browser, terminal and external tools

Hermes offers broad tool categories including web search/extraction,
browser automation, terminal/file operations, memory and orchestration.
Basha should use only the capabilities necessary for its SEO use cases.

### Recommended policy

-   Prefer structured APIs over browser clicking for stable, authorised
    integrations.
-   Use browser automation only when necessary and only in the correct
    user-authorised session.
-   Run shell commands in a sandbox with restricted filesystem/network
    access.
-   Never execute commands found in crawled webpages or external
    documents.
-   Validate all paths, domains, commands and tool arguments.
-   Keep browser cookies, credentials and client files isolated.
-   Capture evidence and status for actions that modify state.
-   Do not use a browser tool to bypass CAPTCHAs, access controls or
    platform restrictions.

## A8. Checkpoints and recovery

A file-editing agent may use filesystem checkpoints. Basha needs an
equivalent for every supported change type.

Before a change, record: - Target resource and version/ETag when
available - Existing value or recoverable snapshot - Proposed value -
Approval reference - Operation ID - Rollback method - Time and actor

After the change: - Read the resource again. - Compare expected and
actual state. - Save the verification result. - If verification fails,
stop dependent work and try rollback only if it is safe and supported. -
Report partial completion honestly.

Do not claim universal rollback support. Some external APIs and
third-party systems may not support restoration.

## A9. Security principles to adopt

Hermes' published security guide describes layered controls such as user
authorization, approval for dangerous commands, file-write safety,
container isolation, credential filtering, context-file scanning,
cross-session isolation and input sanitization. Basha should translate
the same general defence-in-depth principle into its own backend
architecture.

Minimum Basha controls: 1. User and workspace authorisation. 2. Per-tool
permissions. 3. Human approval for high-impact operations. 4. Secure
secret storage and redaction. 5. Client/session isolation. 6. Sandbox
for code execution and file operations. 7. Prompt-injection handling for
crawled content. 8. SSRF protection for URL fetching. 9. Input schema
validation and command/path allowlists. 10. Audit logs, monitoring, rate
limits and cost controls.

These are architectural requirements; a Markdown policy alone does not
implement them.

------------------------------------------------------------------------

# PART B --- What Basha AI Can Learn from Simplified SEO Tools

## B1. Observed public tool categories

The Simplified SEO Tools homepage publicly lists more than 50 tools and
groups them into categories such as text content, keywords, backlinks,
website management, website tracking, domains, metadata and other
utilities. The public catalogue includes examples such as a plagiarism
checker, meta tag generator/analyzer, robots.txt generator, XML sitemap
generator, schema markup generator, keyword position checker, keyword
suggestions, keyword density checker, backlink checker, broken links
finder, link analyzer, page-speed checker, page-size checker, redirect
checker, source-code viewer, DNS lookup, domain age and domain-authority
tools.

This section records the public catalogue categories, not an independent
validation of each tool's accuracy, methodology, availability or data
source. A listed feature does not establish that it is reliable enough
for automated decisions.

## B2. Product lesson: users value focused utilities

A broad SEO platform can be built from many small tools that each solve
a clear problem. Basha should expose these as **explainable tools within
one workflow**, rather than forcing the user to navigate dozens of
unrelated pages.

Recommended UX pattern: - User enters a URL or selects a connected
website. - Basha shows the relevant checks. - Each check explains what
it measures. - Results include evidence and limitations. - Related
checks are grouped into an audit. - Users can save or export a report. -
Actions that change the website are separated from analysis utilities.

## B3. Recommended Basha tool catalogue

### Category 1 --- Metadata and on-page analysis

**1. Meta Tag Analyzer** - Input: URL or HTML captured from an
authorised fetch. - Output: title, description, robots directives,
canonical, Open Graph fields where present. - Checks: missing fields,
duplicate values across crawled URLs, obvious mismatches, malformed
values. - Limitations: HTML fetch may not match rendered DOM; search
engines can rewrite titles/snippets. - Safe action: generate a proposed
correction, not automatically write it.

**2. Meta Tag Generator** - Input: page text, target topic, brand rules,
audience and CTA. - Output: candidate title and meta description. -
Rules: accurately reflect the visible content, avoid stuffing, do not
invent offers or claims. - Verification: user review and, if authorised,
saved-value re-read.

**3. Heading and Content Structure Checker** - Input: URL or HTML. -
Output: headings, hierarchy, repeated headings and potential content
gaps. - Rules: do not flag a single structural pattern as a guaranteed
ranking penalty; explain accessibility and clarity issues separately
from SEO hypotheses.

**4. Image SEO Checker** - Input: page HTML and image metadata. -
Output: missing/empty alt text classifications, oversized images where
measurable, missing dimensions where detectable. - Rules: distinguish
decorative from informative images; never mass-generate keyword-stuffed
alt text.

### Category 2 --- Keyword and content utilities

**5. Keyword Suggestions** - Input: seed query, geography, language and
business profile. - Output: related questions and topic ideas, plus
metrics only when retrieved from a named source. - Rules: label
generated suggestions as ideas; do not label them as measured search
demand.

**6. Keyword Density / Repetition Checker** - Input: text or page
content. - Output: term frequencies and repetition patterns. - Rules:
treat density as a diagnostic, not a target percentage or ranking
formula. Prioritise natural language and user usefulness.

**7. Keyword-to-Page Mapper** - Input: query set and site URL
inventory. - Output: proposed target page for each topic, duplicates and
gaps. - Rules: check existing pages and intent before recommending a new
URL.

**8. Content Similarity / Plagiarism Workflow** - Input: content and a
supported, lawful comparison corpus/provider. - Output: similarity
evidence and matched passages when available. - Rules: do not claim a
definitive plagiarism verdict without reliable comparison evidence;
similarity is not always infringement, and different wording is not
proof of originality. - Privacy: do not submit confidential client text
to third-party services without authorisation.

**9. Content Rewriter / Editor** - Input: authorised text, target
audience, brand voice and intended purpose. - Output: an edited draft. -
Rules: preserve meaning and factual claims; mark unsupported claims; do
not use rewriting to evade plagiarism detection or misrepresent
authorship.

**10. Word Count and Readability** - Input: draft or page. - Output:
word count, sentence length and configured readability metrics. - Rules:
explain the metric; do not impose arbitrary word counts as a universal
SEO rule.

### Category 3 --- Technical SEO utilities

**11. Robots.txt Inspector / Draft Generator** - Input: current
robots.txt and the owner's crawl/indexing goals. - Output: parsed
directives, possible conflicts and proposed file. - Rules: never deploy
a robots change automatically by default; a bad rule can block large
portions of a site. - Verification: syntax check, compare before/after,
test key URL patterns and require approval.

**12. XML Sitemap Inspector / Generator** - Input: URL inventory and
canonical/indexability signals. - Output: candidate sitemap, invalid
entries and coverage differences. - Rules: include appropriate canonical
URLs; don't imply submission guarantees indexing. - Verification: parse
generated XML, check URL responses, inspect sitemap index references.

**13. Structured Data Generator / Validator** - Input: verified
entity/page facts and schema type. - Output: JSON-LD draft and
validation findings. - Rules: use only truthful properties supported by
visible page content; never fabricate ratings or reviews. -
Verification: syntax validation and applicable official testing tools
where available.

**14. Broken Links Finder** - Input: permitted crawl scope and rate
limits. - Output: source URL, link target, status, first-seen time and
evidence. - Rules: handle timeouts and rate limits; distinguish
temporary errors from confirmed failures; avoid excessive requests. -
Fixes: recommend a relevant replacement or correction; do not redirect
all broken URLs to the homepage.

**15. Redirect Checker** - Input: URL list. - Output: status chain,
final URL, loops, excessive hops and errors. - Rules: cap redirect
depth; avoid following unsafe/private-network targets; report external
redirects separately. - Fixes: high-risk; preview and approve
configuration changes.

**16. Page Size / Performance Checker** - Input: URL and available
performance service. - Output: response size, timing and lab/field
metrics where available. - Rules: state the measurement source, time,
device and test limitations. Do not treat one test as proof of site-wide
performance.

**17. Source Code / Rendered Page Inspector** - Input: URL and permitted
fetch/render mode. - Output: selected HTML fields or rendered
evidence. - Rules: label whether data came from raw response HTML or
rendered browser DOM; redact sensitive data and do not execute untrusted
code outside a sandbox.

**18. HTTP Status / Server Availability Checker** - Input: URL list. -
Output: status, response time, error category and check time. - Rules:
rate-limit requests; do not infer that a single timeout means a site is
permanently down.

### Category 4 --- Backlinks and links

**19. Backlink Checker** - Input: domain/URL and a connected, identified
backlink data provider. - Output: discovered links, source, target,
anchor, provider and discovery date. - Rules: backlink databases are
incomplete; never claim a complete web-wide backlink list. - Risk: avoid
making disavow recommendations from a third-party authority score alone.

**20. Link Analyzer** - Input: page HTML. - Output: internal/external
links, anchors, target status where checked and nofollow/rel attributes
where present. - Rules: separate link extraction from verification of
the destination.

**21. Backlink Outreach Planner** - Input: legitimate campaign goal and
relevant publisher prospects. - Output: a researched, personalised
outreach draft and tracking plan. - Rules: no mass spam, deceptive
claims or automated link schemes. Sending messages requires appropriate
approval and compliance.

**22. Link/Authority Metrics** - Input: a named provider, if
available. - Output: provider-defined metrics with date and
definition. - Rules: label third-party authority scores as proprietary
estimates, not Google metrics or direct ranking factors.

### Category 5 --- Domain, DNS and site diagnostics

**23. DNS Lookup** - Input: domain. - Output: available DNS record types
and lookup timestamp. - Rules: DNS changes are high impact; inspection
must be read-only unless a separately authorised provider integration
exists.

**24. Domain / Hosting Lookup** - Input: domain and a reliable data
source. - Output: only the fields actually returned by that source. -
Rules: do not infer private hosting details or guarantee ownership from
a third-party lookup.

**25. Redirect and Canonical Domain Check** - Input: common domain
variants and configured canonical domain. - Output: observed redirect
paths, final destination and consistency findings. - Rules: avoid
changing DNS or server configuration automatically.

**26. Suspicious Domain / Malware Checks** - Input: domain and named
threat-intelligence source. - Output: provider result, timestamp and
limitations. - Rules: "not listed" does not prove a site is safe. Do not
present unverified third-party labels as definitive malware findings.

**27. Indexing Status Check** - Input: URL and an authorised
search-console or other identified source. - Output: source-specific
status and timestamp. - Rules: avoid presenting a third-party "index
checker" as definitive if it lacks direct authoritative access. Search
engine indexing decisions can change.

### Category 6 --- Reporting and monitoring

**28. Website Audit Dashboard** - Summarise crawl coverage, key issues,
severity, evidence and status. - Separate newly discovered, still open,
resolved and regressed issues. - Do not count a recommendation as
resolved until it has been rechecked.

**29. Scheduled Monitoring** - Run approved read-only checks at a chosen
cadence. - Compare with the last successful run. - Alert on meaningful
changes rather than sending duplicate alerts for every unchanged
issue. - Include run time, failed checks and coverage.

**30. Exportable Reports** - PDF/CSV/HTML exports should show source,
date, scope, definitions, limitations and recommended next steps. -
Avoid claiming business impact that has not been measured.

------------------------------------------------------------------------

# PART C --- Basha AI Tool Quality Standards

## C1. Standard tool specification

Every SEO utility must have this specification before release:

``` yaml
tool_id: meta_tag_analyzer
display_name: Meta Tag Analyzer
category: on_page_seo
status: planned
input_schema:
  url: string
  workspace_id: derived_from_auth
  render_mode: raw_html_or_browser_render
permissions:
  access: read_only
risk_level: low
output_schema:
  requested_url: string
  final_url: string
  title: string_or_null
  meta_description: string_or_null
  canonical: string_or_null
  robots_directives: list
  evidence_timestamp: datetime
  fetch_status: string
limitations:
  - raw_html_may_differ_from_rendered_dom
  - search_engines_may_rewrite_snippets
verification:
  - validate_response_status
  - record_source_and_timestamp
```

This is a template, not an implemented tool. Each actual implementation
must validate inputs and produce schema-conforming output.

## C2. Common error format

``` json
{
  "status": "failed",
  "tool_id": "meta_tag_analyzer",
  "error_code": "FETCH_TIMEOUT",
  "message": "The page could not be retrieved within the configured time limit.",
  "retryable": true,
  "evidence": {
    "requested_url": "redacted-or-validated-url",
    "timestamp": "ISO-8601 timestamp"
  }
}
```

Do not expose secrets, internal stack traces or sensitive headers in
user-facing errors.

## C3. Output quality rules

Every tool result must state: - What was checked - What source was
used - When it was checked - What was found - What was not checked - Any
confidence or measurement limitation - What action is recommended -
Whether the result is a finding, a draft, an executed action or a
verified change

## C4. Test strategy

For each tool, test: - Valid input - Invalid input - Timeout - Rate
limit - Authentication failure - Permission failure - Malformed
response - Empty data - Unexpected redirect - Repeated request -
Cross-client access attempt - Untrusted content injection - Accurate
user-facing explanation

A tool is not production-ready simply because it works for one
happy-path URL.

------------------------------------------------------------------------

# PART D --- Recommended Basha Product Architecture

## D1. Recommended system layers

``` text
Basha UI
  |
Authenticated API / Session Layer
  |
Orchestrator and Task State Machine
  |
Policy Engine ---- Approval Service ---- Audit Log
  |
Skill / Workflow Registry
  |
Tool Gateway
  |-- Crawler and HTTP Inspector
  |-- SEO Analysis Functions
  |-- Search Console / Analytics Connectors
  |-- WordPress Connector
  |-- Reporting Service
  |-- Scheduler / Notification Service
  |
Structured Database + Object Storage + Searchable Knowledge Index
```

The model should not directly bypass the policy engine or write to
customer systems. All side effects pass through the tool gateway and
backend authorisation.

## D2. Task state machine

Use explicit task states such as:

-   `queued`
-   `planning`
-   `waiting_for_input`
-   `running_read_only`
-   `waiting_for_approval`
-   `running_write`
-   `verifying`
-   `completed`
-   `partial`
-   `failed`
-   `cancelled`

Record state transitions and reasons. A task must not transition to
`completed` solely because the model produced a success message.

## D3. Initial MVP sequence

**Phase 1 --- Read-only audit** - URL input and crawl limits - Page
metadata extraction - HTTP status and redirect analysis - Sitemap and
robots inspection - Broken-link detection - Evidence-based report

**Phase 2 --- Connected data** - Search Console integration -
Performance data integration - Page/query mapping - Trend reports with
explicit date ranges

**Phase 3 --- Assisted edits** - WordPress connection - Metadata update
proposals - Before/after snapshots - Approval flow - Read-back
verification

**Phase 4 --- Monitoring and skills** - Reusable workflow registry -
Scheduled read-only audits - Alerts for meaningful changes - Skill
versioning and evaluation

**Phase 5 --- Bounded autonomy** - Explicitly allowlisted low-risk
operations - Quotas, policy engine and stop conditions - Rollback where
supported - Human review of high-impact actions

## D4. Product differentiation

Do not try to compete only by offering a long list of isolated
utilities. Basha's differentiated value should be the connection between
diagnosis and verified work:

**Inspect → Explain → Prioritise → Propose → Approve → Execute → Verify
→ Learn safely → Report**

Learning must mean improving documented procedures based on reviewed
outcomes, not silently changing system policy or treating every model
output as truth.

------------------------------------------------------------------------

# PART E --- Research Notes and Limitations

## E1. Hermes Agent --- source-derived points

The public Hermes Agent documentation describes: - Toolsets for web,
browser, terminal/files, media, orchestration, memory and automation. -
Skills as on-demand procedural knowledge, with progressive disclosure. -
Persistent memory and context files. - Scheduled jobs, subagent
delegation, code execution and hooks. - Plugin and MCP extension
patterns. - A layered security model involving authorization, approvals,
write safety, isolation, credential filtering, prompt-injection
detection and input sanitization.

These are observations from its public documentation. They do not mean
Basha uses the same implementation or that every feature is suitable for
Basha.

## E2. Simplified SEO Tools --- source-derived points

Its public homepage presents a catalogue of more than 50 SEO and web
utilities, organised into text, keyword, backlink, website management,
tracking, domain, metadata and miscellaneous tool categories. Examples
are listed in Part B.

This is a catalogue review only. Tool-level accuracy, current uptime,
exact methodology, API availability, data provenance, licensing and
suitability for autonomous use have not been independently verified
here. Basha should not scrape, copy, or reproduce proprietary code or
protected content. Use the site as a product-discovery reference and
implement original tools with transparent methodology.

## E3. Primary source register

-   Hermes Agent documentation:
    https://hermes-agent.nousresearch.com/docs
-   Hermes feature overview:
    https://hermes-agent.nousresearch.com/docs/user-guide/features/overview
-   Hermes tools and toolsets:
    https://hermes-agent.nousresearch.com/docs/user-guide/features/tools
-   Hermes skills system:
    https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
-   Hermes memory:
    https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
-   Hermes security:
    https://hermes-agent.nousresearch.com/docs/user-guide/security
-   Simplified SEO Tools homepage/catalogue:
    https://simplifiedseotools.com/
-   Google Search Central: https://developers.google.com/search/docs
-   WordPress REST API: https://developer.wordpress.org/rest-api/
-   OWASP API Security: https://owasp.org/www-project-api-security/
-   OWASP GenAI Security: https://genai.owasp.org/

------------------------------------------------------------------------

# PART F --- Implementation Acceptance Checklist

Before Basha exposes any feature to customers:

-   [ ] Tool is marked `planned`, `limited` or `available` accurately.
-   [ ] Input/output schemas are documented and validated.
-   [ ] Authentication and workspace isolation are tested.
-   [ ] Read/write permissions are enforced by the backend.
-   [ ] Source, timestamp and limitations are included in results.
-   [ ] Failure, timeout, rate-limit and malformed-response cases are
    tested.
-   [ ] Prompt injection and SSRF protections are tested where
    applicable.
-   [ ] Write operations have approval, snapshots and verification.
-   [ ] Rollback is tested where advertised.
-   [ ] Cost, concurrency and URL limits are configured.
-   [ ] Logs redact credentials and unnecessary personal data.
-   [ ] User-facing claims accurately reflect observed results.
-   [ ] Official platform documentation has been checked for the current
    implementation.

## Final rule

**Use Hermes as an architectural reference for persistent agent
workflows, skills, memory, scheduling and security. Use Simplified SEO
Tools as a catalogue reference for individual SEO utilities. Build
Basha's own validated implementations, transparent evidence, permissions
and end-to-end verified workflows.**
