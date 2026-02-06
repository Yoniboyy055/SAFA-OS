# Phase 2A.2 — Network Corridor Plan (Design Only)

This plan defines how the network corridor will move from scaffold to real
HTTP I/O (Phase 2A.3). No network code is enabled here.

## Allowlist Precedence
1) Global deny (if any future deny list is defined)
2) Domain allowlist
3) URL allowlist (exact match when present)

## Normalization Rules
- Enforce HTTPS by default.
- Strip URL fragments (`#...`).
- Normalize trailing slashes consistently.
- Lowercase hostnames for allowlist matching.

## Audit Event Spec
Events:
- `network.request`: url, domain, method, purpose, bodyHash, bodySummary (truncated)
- `network.result`: status, bytes, durationMs, responseHash

Sensitive fields (headers, auth tokens, cookies) must be redacted.

## Kill Switch Semantics
When enabled:
- All outbound actions (network/outbound_message/external_tool) are denied.
- Denial must be logged in the audit log.

## Threat Model (Summary)
- SSRF and unauthorized egress
- Credential leakage
- Shadow outbound without audit
- Allowlist bypass via URL normalization tricks

## Go/No-Go Checklist for Phase 2A.3 (Real HTTP)
✅ allowlist/denylist tests  
✅ approval enforcement tests  
✅ audit redaction tests  
✅ kill switch tests  
✅ rate limits / payload caps defined  
✅ explicit owner approval
