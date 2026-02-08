# Phase 14 — Phone / Voice Bridge

## Scope
- Voice command parsing
- Call script generation
- Approval-gated execution
- Logs + replay

## Status
ACTIVE. Voice parsing is local-only with redacted log storage and replay.
Audio capture remains disabled. Phone access is documented in
`docs/architecture/phone-access.md`.

CLI entry points:
- `jarvis voice:parse`
- `jarvis voice:replay`
