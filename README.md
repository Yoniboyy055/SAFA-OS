# Jarvis OS (Governed)

Jarvis OS is a single-core assistant system with modular capabilities, governed by strict policies and permission gates.

## Goals
- Local-first execution
- Network OFF by default (allowlist-only when enabled)
- Permissioned actions (approval gates)
- Append-only audit logging
- Secrets never appear in code, commits, or logs

## Non-Goals
- No always-on autonomous internet agent
- No telemetry
- No implicit installs/deploys/messaging without approval

## Architecture (high-level)
- Governor: policy enforcement, permissions, approvals, kill switch, audit rules
- Planner: reasoning + stress tests + plans
- Manager: orchestration + routing
- Operator: executes approved skills
- Skills Registry: explicit tool contracts
- Audit Log: append-only event log

## Repo Rules
- Protected main branch (PR-based)
- Governance files are treated as source-of-truth

## How to run
1. Ensure Node.js 18+ is available.
2. Review or edit `jarvis.config.json` (network stays OFF by default).
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Test: `npm test`
6. Run:
   - List skills: `node dist/cli/index.js skills`
   - Create a plan: `node dist/cli/index.js plan "summarize audit logging rules"`
   - Attempt execution without approval (refused): \
     `node dist/cli/index.js exec "summarize audit logging rules"`
   - Execute with approval: \
     `node dist/cli/index.js exec "summarize audit logging rules" --approve`
   - Read a file: `node dist/cli/index.js run read_file --input '{"path":"README.md"}'`
   - Write a file (requires approval + allowlist): \
     `node dist/cli/index.js run write_file --approve --input '{"path":"data/example.txt","content":"hello"}'`

## Phase 3 Email (Gmail SMTP)
### Setup Gmail App Password
- Google Account → Security → App Passwords
- Store the app password in `.env` (never commit).

### Commands
```
npm install
npm run build
node dist/cli/index.js email:queue --input '{"to":["a@allow.com"],"subject":"Hello","text":"Draft body"}'
node dist/cli/index.js email:send --approve --input '{"to":"a@allow.com","subject":"Hello","text":"Live body","dryRun":false}'
```
