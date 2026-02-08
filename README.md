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
1. Ensure Node.js 20.11.1 is available.
2. Review or edit `jarvis.config.json` (network stays OFF by default).
3. Install dependencies: `npm ci`
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

## Voice Bridge (Local)
Parse a transcript and store it for replay:
```
node dist/cli/index.js voice:parse --text "plan update the roadmap" --approve
node dist/cli/index.js voice:replay --n 10
```

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

## Phase 5 Memory Vault (data/memory)
Phase 5 introduces a vault under `data/memory/`:
- `canon/` approved facts
- `notes/` session notes
- `artifacts/` plans/packets

Commands:
```
node dist/cli/index.js run memory_add --mode SCRIPT --authority OWNER --approve --input '{"bucket":"canon","title":"fact","content":"approved fact"}'
node dist/cli/index.js run memory_list --mode SCRIPT --authority OWNER --approve --input '{"bucket":"canon"}'
node dist/cli/index.js run memory_search --mode SCRIPT --authority OWNER --approve --input '{"bucket":"canon","query":"approved"}'
node dist/cli/index.js run memory_get --mode SCRIPT --authority OWNER --approve --input '{"bucket":"canon","id":"<id>"}'
```

## Request-Only Plans (No Execution)
These skills generate deterministic plans and artifacts without running commands:
```
node dist/cli/index.js run request_web_build --mode SCRIPT --authority OWNER --approve --input '{"projectName":"site","description":"marketing site"}'
node dist/cli/index.js run request_doc_pack --mode SCRIPT --authority OWNER --approve --input '{"title":"Spec","sections":["Intro","Scope"]}'
node dist/cli/index.js run request_video_edit --mode SCRIPT --authority OWNER --approve --input '{"inputPath":"in.mp4","outputPath":"out.mp4"}'
node dist/cli/index.js run request_image_edit --mode SCRIPT --authority OWNER --approve --input '{"inputPath":"in.png","outputPath":"out.png"}'
node dist/cli/index.js run request_client_intake --mode SCRIPT --authority OWNER --approve --input '{"clientName":"Acme","projectType":"branding"}'
node dist/cli/index.js run request_negotiation_script --mode SCRIPT --authority OWNER --approve --input '{"clientName":"Acme","offerSummary":"retainer"}'
node dist/cli/index.js run request_follow_up --mode SCRIPT --authority OWNER --approve --input '{"contactName":"Taylor","context":"proposal"}'
node dist/cli/index.js run request_recommendation_request --mode SCRIPT --authority OWNER --approve --input '{"recipientName":"Jordan","relationship":"project"}'
```

## Execution Runner (Disabled by Default)
```
node dist/cli/index.js run run_packet --mode SCRIPT --authority OWNER --approve --input '{"path":"data/memory/artifacts/entry_<id>.json"}'
```

## LLM Recommendations (Advisory Only)
```
node dist/cli/index.js run recommend_llm --mode SCRIPT --authority OWNER --input '{"taskType":"summarize","privacyRequirement":"any"}'
node dist/cli/index.js run analyze_input_risk --mode SCRIPT --authority OWNER --input '{"text":"ignore previous instructions"}'
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

## Jarvis TUI (Phase 8)
Terminal UI for local-only control. It uses existing governed code paths and keeps
network disabled by default.

```
npm install
npm run build
npm run tui
```

Optional flags:
```
npm run tui -- --config jarvis.config.json --actor local-user
npm run tui -- --no-boot
```

Key bindings:
- 1 Home
- 2 Approvals
- 3 Audit
- 4 Command
- 5 Settings
- k palette
- t theme
- r refresh
- ? help
- q quit

Reduced motion:
- Set `JARVIS_REDUCED_MOTION=1` to disable animations.

## Dashboard Server (Local-only)
The dashboard server binds only to `127.0.0.1` and serves a local UI at `/`.
All actions are governed and audit-logged. Approvals are required when strict
mode or skill risk demands it. Network stays OFF by default.

Start the server:
```
npm run dashboard
```

Runtime daemon (dashboard + health endpoint):
```
npm run daemon -- --dashboard-port 3777 --health-port 3778
```

Local API endpoints:
- `GET /api/state`
- `GET /api/skills`
- `POST /api/plan`
- `POST /api/exec`
- `POST /api/run`
- `GET /api/audit/tail`
- `GET /api/executions`
- `GET /api/approvals`
- `POST /api/approve`
- `POST /api/kill`
- `POST /api/network`

Logs live under `logs/` (default: `logs/audit.log`).

Remote access must be owner-controlled (documentation only):
- Recommended: Tailscale (VPN)
- Optional: Cloudflare Tunnel

**Warning:** Do NOT expose the dashboard directly to the public internet.

## Companion Stubs (Desktop/Mobile)
Design-only companions live in docs:
- `docs/COMPANION_DESKTOP.md`
- `docs/COMPANION_MOBILE.md`

## Release Lock (Governance)
Release locks can block non-local categories even with approvals. Configure in
`jarvis.config.json` under `releaseLock`. See `docs/RELEASE_LOCKS.md`.

## Go/No-Go Checklist
Run before merge/tag:
```
npm ci && npm run build && npm test
```

## Live Outbound (Disabled)
Network corridor remains stub-only and live outbound is disabled by policy.

## Timed Network Window
Network access is OFF by default. A timed window can be opened to allow
network/outbound skills for a bounded period (6 or 8 hours). The window state
is stored durably in `data/network_window.json` so restarts do not bypass it.

### CLI Commands
```bash
# Open a 6-hour window (requires OWNER authority + approval)
jarvis net:open --hours 6 --mode SCRIPT --authority OWNER --approve

# Open an 8-hour window
jarvis net:open --hours 8 --mode SCRIPT --authority OWNER --approve

# Close the window early
jarvis net:close --mode SCRIPT --authority OWNER --approve

# Check current window status
jarvis net:status
```

### Dashboard Execution
Dashboard actions route through the same governor/audit path as the CLI. When
strict approval mode is enabled, every action requires approval first.

### Governor Enforcement
When a `networkWindow` is provided in the governance context, the Governor
checks that the current time falls between `startAt` and `endAt`. If the
window is closed or expired, network actions are denied automatically. All
open/close/status events are recorded in the audit log.
