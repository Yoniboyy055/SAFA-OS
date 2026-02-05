# Network Corridor (Phase 2A Scaffold)

This document describes the **Network Corridor** scaffold. It is OFF by
default and does not perform any real network I/O. GOVERNOR.md remains supreme
law.

## Core Principles
- **OFF by default**: `network.enabled` defaults to `false`.
- **Allowlist-only**: requests must match configured domain and optional URL
  allowlists.
- **Explicit approvals**: strict approval mode requires explicit approval for
  all network actions.
- **Audit everything**: all requests and results are logged (append-only).
- **Secrets isolation**: sensitive headers are redacted and bodies are not
  logged (hash + summary only).
- **Kill switch**: outbound actions are blocked when enabled.

## Approval Modes
- `per_request` (default)
- `plan_hash` (future; spec only)

## Audit Logging
Each network attempt logs:
- timestamp, actor, action type, approved?
- url (or sanitized url), domain, method, purpose
- bodyHash + truncated bodySummary

Each network result logs:
- response status, bytes, durationMs, responseHash

No secrets or raw payloads are logged.

## Phase 2A.2 Requirement (Real I/O)
Real network I/O requires explicit owner approval and a follow-up phase that:
- Implements the actual HTTP client under governance rules.
- Expands allowlist and approval enforcement.
- Adds tests for allowlist, approval, and audit coverage.

Until then, the corridor operates in **stub mode** only.
