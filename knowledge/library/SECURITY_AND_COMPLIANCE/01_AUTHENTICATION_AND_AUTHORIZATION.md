# Authentication, Authorization and Scopes

| Field | Value |
|---|---|
| Document ID | BASHA-SEC-001 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PARTIAL: principles from S23 (MCP security best practices: scope minimisation, token audience, confused deputy) and S20. OWASP Top 10 / API Security Top 10, NIST SSDF and cloud IAM docs NOT yet read. |

## Facts [FACT, S23]
- **Scope minimisation:** start with minimal read scopes; elevate incrementally; avoid wildcard/omnibus scopes; log elevation events.
- **Token audience:** a server must not accept tokens not issued for it ("token passthrough" is an anti-pattern); validate audience.
- **Confused deputy:** per-client consent, exact redirect-URI matching, single-use state with short expiry.
- **State handles** (e.g. task IDs) are not authentication: bind them server-side to the authenticated user and use unguessable IDs.

## Basha rules [PROPOSED]
1. Every request carries a verified user identity and tenant ID derived from the session/token, never from the request body or the model.
2. Role-based access: Owner, Admin, Editor, Viewer (proposal) mapped to modes and risk classes.
3. Connector credentials (OAuth refresh tokens, Application Passwords) are stored encrypted, per tenant, retrievable only by the connector service.
4. Third-party OAuth scopes are read-only by default; write scopes are requested only when the tenant enables a write feature.
5. Task, approval and report IDs are random, and every access checks ownership.
6. Admin/support access to tenant data is explicit, time-limited and audit-logged.

## Detection and verification
Authorisation tests: user A cannot read/modify tenant B's task, report, connector, or approval (TS-ISO-01..04). Automated IDOR tests on every endpoint that takes an ID.

## Errors
401 unauthenticated; 403 forbidden; never reveal whether another tenant's resource exists (return 404 for both).

## Limitations
This file is a design baseline, not a compliance certification.

## Sources
S23, S20.
