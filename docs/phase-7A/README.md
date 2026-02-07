# Phase 7A — ACTIVE (Local Private Use)

## What is enabled
- Local dashboard UI at `http://127.0.0.1:3777/`
- GET endpoints: `/health`, `/status`, `/skills`
- POST `/command` for **governed execution** and dry-run simulation
- Governed pipeline: parser → packet → governor → decision → preview
- SAFE MODE banner with kill switch enforced
- One-button freeze control (safety override)
- VR status panel (hardware disarmed by default)
- Dry-run toggle for local execution

## What is forbidden
- Real execution (no live calls, no outbound network)
- Public binding (no 0.0.0.0)
- Any action without owner authority, mode, and approvals
- Phase 7B capabilities remain locked
- Network, email, calls, and payments remain denied

## Why gates exist
Strict governance prevents accidental execution and protects sensitive data.

## How to test safely
1) `npm run build`
2) `npm test`
3) Start dashboard:
   ```
   $env:JARVIS_OWNER_TOKEN="LONG_RANDOM_TOKEN"
   node dist/dashboard/server.js
   ```
4) Open:
   - http://127.0.0.1:3777/
   - http://127.0.0.1:3777/status
   - http://127.0.0.1:3777/vr/status
