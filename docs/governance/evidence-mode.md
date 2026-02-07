# Evidence Mode & Shadow Run

Evidence Mode:
- Every command returns a structured explanation:
  - decision reason
  - touched targets (redacted)
  - recommended next safe action

Responses redact secrets and PII before rendering in the UI.

Shadow Run:
- Risky actions are simulated only.
- No external execution is performed.

These features are always on in Phase 7A.
