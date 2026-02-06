# Approval UX — Phase 3 (Email)

Phase 3 introduces governed outbound email, payments, and calls. Approval is
required for all outbound actions under strict approval mode.

## Approval Flow
- Queue (dry-run) still requires approval when strict approval is enabled.
- Send (real) requires explicit `--approve` plus all allowlist gates.
 - Payments and calls follow the same approval requirements.

## Audit Logging
Approval events must include:
- timestamp, actor, action type
- approved? (true/false)
- target (recipient set or draft id)
- result + reason

No body content or credentials are logged.
