# Server-Side Request Forgery (SSRF) and Crawler Security

| Field | Value |
|---|---|
| Document ID | BASHA-SEC-006 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S21 (OWASP SSRF Prevention Cheat Sheet; no date shown) and S23 (MCP security best practices). OWASP API Top 10 not yet read. |

## Why it matters
Basha fetches URLs on behalf of users and models. An attacker can supply (or inject) URLs pointing to internal services or cloud metadata.

## Facts
- **[FACT, S21]** Two cases: known destinations (allowlist) vs arbitrary external destinations (blocklist as fallback plus validating that resolved addresses are public, plus network controls). Disable automatic redirect following and validate each hop. Domain allowlists alone do not stop **DNS rebinding**: resolve, validate **every** returned IP, then connect only to a validated address while keeping the original hostname for Host/SNI/certificate checks. Minimum deny set includes `169.254.169.254` and GCP metadata host, `127.0.0.0/8`, `0.0.0.0/8`, `::1`, RFC 1918, `fc00::/7`, `fe80::/10`, multicast. Deny-lists are bypass-prone: last resort.
- **[FACT, S23]** MCP guidance: enforce HTTPS, block private ranges (10/8, 172.16/12, 192.168/16, 127/8, ::1, 169.254/16, fc00::/7, fe80::/10), validate redirect targets, use an egress proxy (e.g. Smokescreen), avoid hand-written IP validation (octal/hex/IPv4-mapped tricks), and beware DNS TOCTOU (pin resolution).

## Basha's implementation status [VERIFIED internal]
The live Baasha AI web agent (`server/baasha/ssrf.js`) validates at connect time: only public IPs (via `net.BlockList`), manual redirects re-validated each hop, text content types only, size and time caps. It has unit tests. This is a **defence in depth** control, not a substitute for a network egress policy.

## Rules for the full product [PROPOSED]
1. All outbound fetches go through one SSRF-safe fetcher; no tool opens sockets itself.
2. Prefer **allowlists** for connectors (customer's own domain, API hosts); use the public-IP check only for open-web research.
3. Per-tenant crawl scope: the crawler stays on the verified domain(s); respects robots.txt for crawling (S03/S27) and rate limits.
4. Run fetchers in an isolated network segment with no route to internal services and no cloud credentials.
5. Never return raw upstream error bodies to the model or user if they could reveal internal details.
6. Log blocked attempts with tenant and task for review.

## Tests
- TS-SSRF-01: `http://169.254.169.254/latest/meta-data/` => blocked.
- TS-SSRF-02: hostname resolving to 10.0.0.5 => blocked.
- TS-SSRF-03: public URL redirecting to `http://127.0.0.1:6379/` => blocked at the redirect hop.
- TS-SSRF-04: DNS rebinding (first answer public, second private) => connection uses a validated address only.
Status: TS-SSRF-01..03 exist in the web agent's test suite; 04 is a design target.

## Limitations
IPv6 transition mechanisms and unusual URL parsers need specific tests.

## Sources
S21, S23.
