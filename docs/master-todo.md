# SAFA OS — Master TODO List (Phase 0 → 17)

> This file captures the **work to be done** (not a status report).

---

## PHASE 0 — FOUNDATION (BOOTSTRAP)
Goal: Create a controllable system shell.

### TODO
- [ ] Initialize mono-repo structure
- [ ] Define core folders: core/, skills/, types/, tests/, dashboard/
- [ ] Add TypeScript strict config
- [ ] Add build (tsc) + test (node:test) pipelines
- [ ] Ensure zero network dependency

### DONE WHEN
- npm run build passes
- npm test passes
- No runtime side effects

---

## PHASE 1 — AUTHORITY & GOVERNANCE
Goal: SAFA cannot act without permission.

### TODO
- [ ] Implement authority chain (Owner → SAFA → Tools)
- [ ] Implement kill switch (global + scoped)
- [ ] Add approval requirement by risk level
- [ ] Add immutable audit logger
- [ ] Add redaction rules

### DONE WHEN
- Unsafe actions are refused
- Kill switch blocks everything instantly
- All actions are logged

---

## PHASE 2 — SKILL SYSTEM
Goal: Give SAFA controlled hands.

### PHASE 2A — LOCAL SKILLS
#### TODO
- [ ] Define SkillDefinition + SkillExecutionContext
- [ ] Implement local skills (read/write/search/run_tests)
- [ ] Enforce handler isolation
- [ ] Add skill registry

### PHASE 2A.2 — CORRIDOR DESIGN
#### TODO
- [ ] Define action categories (local / network / outbound)
- [ ] Implement allowWhenNetworkOff logic
- [ ] Create corridor test suite
- [ ] Add dry-run flag

### DONE WHEN
- Skills exist but cannot escape scope
- Corridor tests pass offline

---

## PHASE 3 — FULL POWER (OFFLINE)
Goal: Maximum intelligence with zero real-world effect.

### TODO
- [ ] Implement Planner / Manager / Operator roles
- [ ] Implement command modes (CREATE / BUILD / DECIDE / SCRIPT)
- [ ] Add memory guard (approved facts only)
- [ ] Add cost guard
- [ ] Add LLM router logic only (no providers)
- [ ] Add run_tests skill
- [ ] Add safe dashboard simulation mode

### DONE WHEN
- SAFA can plan complex systems
- Nothing touches network or money

---

## PHASE 4 — NETWORK CORRIDOR (PREVIEW ONLY)
Goal: Awareness without execution.

### TODO
- [ ] Add network policy engine
- [ ] Add allowlist (domains / URLs)
- [ ] Add timeout + maxBytes
- [ ] Implement stub network client
- [ ] Add send_http_request (preview)
- [ ] Add email / call / payment request skills
- [ ] Enforce approval gates
- [ ] Network OFF by default

### DONE WHEN
- Network calls are preview-only
- Governor blocks real execution

---

## PHASE 5 — OUTBOUND ORCHESTRATION (DRY-RUN)
Goal: Simulate business operations.

### TODO
- [ ] Email drafting + queue
- [ ] Call request objects
- [ ] Payment intent previews
- [ ] Cost estimation
- [ ] Approval UX
- [ ] Full audit trail

### DONE WHEN
- End-to-end workflows simulate cleanly
- Nothing is sent

---

## PHASE 6 — MEMORY & PATTERNS
Goal: Intelligence without manipulation.

### TODO
- [ ] Approved memory store
- [ ] Pattern reflection (read-only)
- [ ] No behavior steering
- [ ] No hidden state
- [x] Memory deletion + review flow

### DONE WHEN
- SAFA remembers facts only with approval
- Cannot influence decisions covertly

---

## PHASE 7 — DASHBOARD (CONTROL SURFACE)
Goal: Human command center.

### TODO
- [ ] Local web dashboard
- [ ] Command input panel
- [ ] Approval panel
- [ ] Kill switch UI
- [ ] Audit viewer
- [ ] Safe-mode simulation

### DONE WHEN
- All actions visible and gated
- No UI bypass possible

---

## PHASE 7A — UI SAFE MODE
Goal: Prevent UI from becoming a backdoor.

### TODO
- [ ] Enforce backend governance from UI
- [ ] Disable real execution
- [ ] Add command simulation
- [ ] Add UI audit hooks

### DONE WHEN
- UI cannot execute anything unsafe

---

## PHASE 8 — OS WINDOW (VISUAL IDENTITY)
Goal: Turn dashboard into an OS.

### TODO
- [ ] Window manager
- [ ] Cards / panels / banners
- [ ] System state indicators
- [ ] Premium OS skin
- [ ] Consistent visual language

### DONE WHEN
- Feels like an operating system
- Not a website

---

## PHASE 8B — THEMING ENGINE
Goal: UI reflects system state.

### TODO
- [ ] State → theme mapping
- [ ] Risk color system
- [ ] Motion rules
- [ ] Accessibility modes

### DONE WHEN
- UI communicates status visually

---

## PHASE 9 — IMMERSIVE MODE (2.5D / 3D)
Goal: Spatial navigation.

### TODO
- [ ] Scene-based UI
- [ ] Camera navigation
- [ ] Zones instead of tabs
- [ ] Performance fallbacks

### DONE WHEN
- OS feels explorable

---

## PHASE 10 — WORLD WIREFRAME
Goal: Game-like OS world.

### TODO
- [ ] Rooms (Audit, Agents, Control)
- [ ] Portals
- [ ] State-driven animation
- [ ] Timeline visualization

### DONE WHEN
- OS becomes an environment

---

## PHASE 11 — AGENT AVATARS
Goal: Make logic visible.

### TODO
- [ ] Governor avatar
- [ ] Manager avatar
- [ ] Operator avatar
- [ ] Visual authority boundaries

### DONE WHEN
- Agents represent logic only (no persona)

---

## PHASE 12 — MULTI-LLM ROUTER (LIVE)
Goal: Flexible brain.

### TODO
- [ ] Cloud LLM adapters
- [ ] Cost/quality/privacy scoring
- [ ] Manual model selection
- [ ] Auto-route option (approved)
- [ ] No silent switching

### DONE WHEN
- SAFA can recommend models transparently

---

## PHASE 13 — BUSINESS OPS (PREVIEW → LIVE)
Goal: Revenue workflows.

### TODO
- [ ] Client intake flows
- [ ] Negotiation scripts
- [ ] Follow-ups
- [ ] Recommendation requests

### DONE WHEN
- Entire business cycle modeled

---

## PHASE 14 — PHONE / VOICE BRIDGE
Goal: Voice interface.

### TODO
- [ ] Voice command parsing
- [ ] Call script generation
- [ ] Approval-gated execution
- [ ] Logs + replay

### DONE WHEN
- Voice becomes another UI

---

## PHASE 15 — REAL NETWORK (LOCKED)
Goal: Carefully touch reality.

### TODO
- [ ] Explicit network enable
- [ ] Scoped time windows
- [ ] Emergency rollback
- [ ] Live provider adapters

### DONE WHEN
- Network can be turned ON safely

---

## PHASE 16 — FULL OS (DESKTOP + PHONE)
Goal: Everywhere control.

### TODO
- [ ] Desktop OS shell
- [ ] Mobile companion
- [ ] Background governed execution
- [ ] Notifications

### DONE WHEN
- One system across devices

---

## PHASE 17 — FINAL FORM (LEVEL 5)
Goal: Maximum intelligence under maximum alignment.

### TODO
- [ ] Lock architecture permanently
- [ ] Freeze authority rules
- [ ] Final red-team
- [ ] Owner sign-off

### DONE WHEN
- SAFA is complete, safe, and loyal
- No further autonomy possible
