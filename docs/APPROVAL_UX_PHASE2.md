# Approval UX — Phase 2 (Design Only)

Phase 2 approvals govern any outbound capability, especially network corridor
usage. This document defines a strict approval UX (no implementation yet).

## Modes
- **Per-request** (default): every outbound request requires explicit approval.
- **Plan-hash** (future): approve a plan digest once; execute only matching steps.

## Requirements
- Approval must be explicit and logged.
- Denials must be logged with reasons.
- Approval must not bypass allowlists or kill switch.

## Audit Logging
Each approval decision logs:
- timestamp, actor, action type
- approved? (true/false)
- target (e.g., plan hash or request id)
- result + reason
