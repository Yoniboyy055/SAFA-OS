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
