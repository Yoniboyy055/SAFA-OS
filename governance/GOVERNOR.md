# GOVERNOR v1 — Non-Negotiable Rules

## Default State
- NETWORK: OFF
- TELEMETRY: OFF
- KILL SWITCH: ON
- STRICT APPROVAL MODE: ON
- AUTONOMY: LIMITED
- LOGGING: ON (append-only, secrets redacted)

## Permission Gates (Explicit Approval Required)
Approval BEFORE:
1) Any network request (HTTP/S, websockets, git fetch, package installs, API calls)
2) Installing dependencies (npm/pip/etc)
3) Deploying to any cloud
4) Sending messages (email/DM/webhook)
5) Reading/writing secret stores
6) Running shell commands that modify system state

## Outbound Execution Rule (Hard Gate)
- Any outbound action requires: --mode + --authority OWNER + --approve

## Phase 5 Network Enablement Gate
- Network remains OFF until the owner explicitly says: "Enable Phase 5 network with allowlists".

## Allowlist-only Networking (When Enabled)
- Deny-by-default
- Domain allowlist only
- Request must include: purpose + endpoint + method + payload summary

## Secrets Policy
- Never commit secrets
- Never log secrets
- Reference by name only (e.g. OPENAI_API_KEY)
- Allowed locations: local .env (gitignored), OS keychain, CI secrets, hosting env vars

## Audit Log Rules
Each action logs:
- timestamp, actor, action type, approved?, target, result

## Kill Switch
One config flag hard-disables:
- networking
- outbound messaging
- external tool calls
