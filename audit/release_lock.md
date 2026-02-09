# SAFA v1.0 Release Lock

Date: 2026-02-08
Status: LOCKED (owner-approved)
Purpose: Define "DONE" and enforce scope lock per gate.

---

## 1) Scope Lock Policy (Per Gate)
Rule: Only files required for the current gate may change.
Allowed file categories per gate:
- Docs: audit/ and docs/ files for that gate.
- Code: src/ files needed for that gate enforcement.
- Tests: tests/ files proving the gate.

Non-gate changes are blocked until the current gate is DONE.

## 2) Chain-of-Custody Rules
- All gate changes must be committed with a gate-specific message.
- No unrelated refactors or formatting-only changes during gate work.
- Evidence must include file references and tests when available.

## 3) DONE v1.0 (Shipping Definition)
SAFA is DONE when all below are true:
- Gate H and Gate C are verified.
- Gate D is verified.
- Job system + approvals work (background work after you leave).
- Kill switch works.
- Audit is complete.
- Desktop UI lets you operate by conversation.
- Phone approvals (at minimum same Wi-Fi).
- Push notifications only for approvals.

## 4) Change Control
Any change to this document or audit/release_plan_v1.md requires explicit owner
approval and must be logged in the audit log with reason.
