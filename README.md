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

## Dashboard Server (Local-only)
The dashboard server binds only to `127.0.0.1` and exposes a minimal local UI at `/`.

## Phone Control (Local-Only, Governed)
The dashboard API exposes local-only endpoints:
- `GET /health`
- `GET /status`
- `POST /command` (accepts `JARVIS: ...` line input)

To start the server, set an owner token:
```
JARVIS_OWNER_TOKEN="set-a-long-random-token" npm run dashboard
```

For `POST /command`, send the token as `X-Owner-Token`.

Example (dry-run):
```
curl -Method POST "http://127.0.0.1:3777/command" `
  -Headers @{ "Content-Type"="application/json"; "X-Owner-Token"="$env:JARVIS_OWNER_TOKEN" } `
  -Body '{"line":"JARVIS: STATUS","mode":"SCRIPT","authority":"OWNER","dryRun":true}'
```

Remote access must be owner-controlled (documentation only):
- Recommended: Tailscale (VPN)
- Optional: Cloudflare Tunnel

**Warning:** Do NOT expose the dashboard directly to the public internet.

## Live Outbound (Disabled)
Network corridor remains stub-only and live outbound is disabled by policy.
