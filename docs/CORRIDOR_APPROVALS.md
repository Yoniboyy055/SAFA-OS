# Corridor Approvals (Design Only)

Status: DESIGN ONLY — corridor remains stub-only.

## Approval Modes
1) **Single Approval**
   - Approve each request explicitly.
2) **Per-Step Approval**
   - Approve each step within a multi-step plan.
3) **Plan-Hash Approval (Recommended)**
   - Owner approves a plan digest once.
   - Only exact-matching steps execute.

## Approval Logging
Each approval must log:
- timestamp
- actor
- action type (network_request)
- target domain
- plan hash or request hash
- approved: true/false

## Approval States
- **PENDING**: awaiting owner decision.
- **APPROVED**: explicitly approved by owner.
- **DENIED**: rejected by owner (reason required).
- **EXPIRED**: approval expired (time-bound).

## Corridor Gate States
- **LOCKED**: kill switch engaged.
- **DISABLED**: network disabled.
- **ALLOWLIST_FAIL**: target not allowlisted.
- **APPROVAL_REQUIRED**: approval missing/invalid.
- **READY**: all gates pass (still stub-only).

## Refusal Reasons (Must Be Explicit)
- Network disabled
- Kill switch enabled
- Allowlist miss
- Approval missing
- Payload too large
- Method not allowlisted

## Security Notes
- No secrets in audit events.
- Headers must be redacted before logging.
- Request/response bodies are never logged.

## Receipt Lifecycle (Local-Only)
1) Approval decision recorded (audit).
2) Immutable receipt generated with hashes only.
3) Receipt is appended to audit timeline (no edits).
