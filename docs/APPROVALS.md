# Approval UX Modes

This document defines approval modes for Jarvis OS. It is a specification only
and does not implement any new behavior.

## Modes

### 1) Single Approval
One approval gates the entire execution session. The approval is valid until
the session ends or a new plan is created.

### 2) Per-Step Approval
Each step in a plan requires its own explicit approval. This is the most
granular mode but can be slower for longer plans.

### 3) Plan-Hash Approval (Recommended)
Approve a plan digest once, then execute only the steps that match the same
plan hash. If the plan changes, approval must be re-issued.

Recommended default: **Plan-hash approval**.

## CLI Contract Examples (Specification Only)
- `jarvis plan "..."`
- `jarvis exec "..." --approve-plan <hash>`
- `jarvis exec "..." --approve` (legacy)

## Audit Logging Requirements
All approval decisions must be logged in the append-only audit log with:
- timestamp
- actor
- action type (e.g., approval.request, approval.grant, approval.deny)
- approved? (true/false)
- target (e.g., plan hash or step id)
- result (success/denied + reason)

No secrets or sensitive payloads should appear in approval logs.
