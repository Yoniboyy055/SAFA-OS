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

## Phase 3 Email (Local-Only)
Live sends are disabled in Phase 3. Use previews and queues only.

### Commands
```
npm install
npm run build
node dist/cli/index.js email:preview --input '{"to":"a@allow.com","subject":"Hello","body":"Draft body"}'
node dist/cli/index.js email:send --approve --input '{"to":"a@allow.com","subject":"Hello","body":"Live body","dryRun":false}'
# (Blocked in Phase 3; preview/queue only)
```

## Phase 3 Payments (Preview-Only)
```
node dist/cli/index.js payment:preview --input '{"priceId":"price_basic","currency":"usd","customerEmail":"user@allow.com"}'
node dist/cli/index.js payment:request --approve --input '{"priceId":"price_basic","currency":"usd","customerEmail":"user@allow.com","dryRun":false}'
# (Blocked in Phase 3; preview only)
```

## Phase 3 Calls (Preview-Only)
```
node dist/cli/index.js call:preview --input '{"toNumber":"+15550002222","intent":"sales","dryRun":true}'
node dist/cli/index.js call:make --approve --input '{"toNumber":"+15550002222","intent":"sales","dryRun":false}'
# (Blocked in Phase 3; preview only)
```

## One-line Commands (JARVIS:)
Use the line adapter for phone-to-laptop relay:
```
jarvis line --text "JARVIS: SKILLS"
jarvis line --text "JARVIS: RUN read_file {\"path\":\"README.md\"} --dry-run"
```
See `docs/PHONE_UX.md` for more examples.

## Memory (Store-All / Use-Approved)
Jarvis maintains three memory tiers:
- Tier 0: `memory/raw/` (append-only, redacted logs; not used for decisions)
- Tier 1: `memory/work/` (session summaries; approval required)
- Tier 2: `memory/canon/` (owner-approved facts; used by Jarvis)

Commands:
```
node dist/cli/index.js run log_interaction --mode SCRIPT --authority OWNER --input '{"text":"summary event"}'
node dist/cli/index.js run write_session_summary --mode SCRIPT --authority OWNER --approve --input '{"summary":"day summary"}'
node dist/cli/index.js run promote_to_canon_memory --mode SCRIPT --authority OWNER --approve --input '{"facts":"approved fact"}'
node dist/cli/index.js run query_canon_memory --mode SCRIPT --authority OWNER --input '{"query":"approved"}'
node dist/cli/index.js run search_raw_logs --mode SCRIPT --authority OWNER --approve --input '{"query":"event"}'
```

## Knowledge Vault (Local-Only)
Local docs live under `knowledge/` with subfolders: playbooks, prompts, policies,
ops, references.

Commands:
```
node dist/cli/index.js run list_knowledge --mode SCRIPT --authority OWNER --input '{}'
node dist/cli/index.js run search_knowledge --mode SCRIPT --authority OWNER --input '{"query":"governor"}'
node dist/cli/index.js run add_knowledge_doc --mode SCRIPT --authority OWNER --approve --input '{"path":"policies/notes.txt","content":"policy notes"}'
```

## Tool Catalog (Advisory Only)
Tools are described in `tools/tools.catalog.json`. Recommendations never execute
or spend without approval.

Commands:
```
node dist/cli/index.js run list_tools --mode SCRIPT --authority OWNER --input '{}'
node dist/cli/index.js run recommend_tool --mode SCRIPT --authority OWNER --approve --input '{"task":"search docs","budgetCapUsd":0}'
```

## Jarvis Cockpit v1 (Local UI)
Open `ui/cockpit/index.html` in a local browser. This UI is static and local-only.

## Dashboard Server (Local-only)
The dashboard server refuses to start while the kill switch is enabled, unless an
explicit owner override is provided. The server only binds to `127.0.0.1`.

```
node dist/dashboard/server.js --port 3777 --mode SCRIPT --authority OWNER --approve --allow-dashboard-under-kill-switch
```

## Live Outbound (Disabled)
Network corridor remains stub-only and live outbound is disabled by policy.
