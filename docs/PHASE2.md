# Phase 2 Options (Direction Only)

This document describes possible Phase 2 paths. It does not implement any
networking. GOVERNOR.md remains supreme law and NETWORK stays OFF by default.

## 2A — Safe Network Gate (Recommended default: 2A)
Purpose: Enable a strictly governed, allowlist-only network gate with explicit
approvals and audit coverage. This is a proposal only; no network code is added
in Phase 2 unless explicitly approved and implemented under governance rules.

Scaffold status:
- See `docs/NETWORK_CORRIDOR.md` for the off-by-default corridor interface and
  policy scaffold. No real network I/O is implemented.

What it would contain (if approved later):
- Allowlist-only networking with domain restrictions.
- Explicit approval for each request (purpose + endpoint + method + payload
  summary).
- Audit logging for every request (attempts and outcomes).
- Kill switch enforcement that disables all outbound actions.

Constraints:
- Network remains OFF by default.
- No telemetry.
- Deny-by-default; allowlist required.
- Secrets are never logged.

## 2B — More Local Skills
Purpose: Expand local-only capabilities without any network access.

What it would contain:
- Additional local skills (e.g., file diffs, structured parsing, local analysis).
- Improved schema validation and richer skill metadata.
- More robust error handling and audit coverage for local actions.

Constraints:
- No network or outbound messaging.
- All actions still require approval when strict mode is enabled.
- Audit logging remains append-only with redaction.

## 2C — UI Shell
Purpose: Provide a local user interface shell for interacting with Jarvis OS.

What it would contain:
- A minimal local UI (CLI TUI or local web UI) that does not enable networking.
- Clear approval prompts and audit summaries.
- Local-only configuration management and status views.

Constraints:
- No remote UI or telemetry.
- Network remains OFF by default.
- All actions are governed and audited.
