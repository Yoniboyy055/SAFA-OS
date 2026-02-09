# SAFA v1.0 Shipments Roadmap (Release Plan)

Date: 2026-02-09
Status: LOCKED (owner-approved)
Scope: SAFA v1.0 shipments and done criteria

This plan is the single source of truth for SAFA v1.0 shipments. Changes require
explicit owner approval and must be logged in audit/release_lock.md.

---

## Shipment 0 — Baseline Freeze (1 hour)
Goal: Stop drift, protect chain-of-custody, prevent looping.
Do:
- Create audit/release_plan_v1.md with this roadmap.
- Create audit/release_lock.md (what DONE means, locked).
- Require scope lock per gate: only files for that gate change.
Done when:
- Docs exist + committed.
- We can point to "this is the plan" and never argue again.

## Shipment 1 — Gate D (Anti-Autonomy)
Goal: SAFA can run in the background but does nothing when idle.
Status: VERIFIED (2026-02-08)
Evidence:
- Tests: npm test (all green).
- Files: src/core/execution_gate.ts, src/skills/registry.ts, src/llm/llm_executor.ts, src/llm/llm_session.ts, src/llm/corridor.ts, src/conversation/conversation_interpreter.ts, src/conversation/session_memory.ts, src/conversation/intent_classifier.ts, src/conversation/presence.ts, src/daemon/daemon.ts, src/core/phase7b/locked.ts, src/core/phase16/locked.ts, audit/autonomy_scan.md, audit/phase_verification.md.
Do:
- Autonomy scan evidence.
- Add audit/autonomy_scan.md.
- Scan for timers/cron/queues/startup-jobs.
- Execution gate (single choke point).
- Add execution_gate.ts.
- Execution allowed only if active session OR delegated job token exists.
- Daemon idle guarantee (listeners only, no polling, no tasks).
- Audit on block: log autonomy.blocked when blocked.
- Tests: idle daemon test, unauthorized execute blocked + audit, delegated job allowed.
Done when:
- Gate D becomes IMPLEMENTED.
- Tests prove no self-start.
- Ledger Phase 2 marked VERIFIED with evidence.

## Shipment 2 — Job System v1 (Background work "after you leave")
Goal: You can start work, close the app, SAFA continues the job.
Status: VERIFIED (2026-02-08)
Evidence:
- Tests: npm test (all green), tests/job_runner.test.ts.
- Files: src/core/job_store.ts, src/core/job_runner.ts, src/core/approval_queue_store.ts, src/core/execution_gate.ts, audit/phase_verification.md.
Do:
- Job objects: job_id, owner_id, scope, risk_level, allowed_tools, TTL.
- Job queue persistence (local file/db; JSON or sqlite).
- Delegation token: created only when you click "Start job", expires.
- Pause on risk: medium/high pauses to Approval Queue.
- Tests: job continues after UI disconnect, TTL expiration stops job.
Done when:
- Background execution works only for approved jobs.
- Ledger Phase 12 moves toward VERIFIED (even if partial).

## Shipment 3 — Approvals v1 (Low/Medium/High fully enforced)
Goal: Risk model is real enforcement system.
Status: VERIFIED (2026-02-09)
Evidence:
- Tests: npm test (all green).
- Files: src/core/approvals.ts, src/core/approval_store.ts, src/core/job_runner.ts, src/cli/index.ts, tests/job_runner.test.ts.
Do:
- Risk classifier explicit and consistent.
- Policy table: Low proceed, Medium require approval, High hard stop.
- Approvals are signed + audited.
- Tests: medium pauses, high blocks, low proceeds.
Done when:
- Approvals are impossible to bypass.
- Ledger entries include tests + evidence.

## Shipment 4 — Gate E (Audit completeness)
Goal: Every action/refusal/approval is logged reliably.
Status: VERIFIED (2026-02-09)
Evidence:
- Tests: npm test (all green).
- Files: src/core/audit.ts, src/skills/registry.ts, tests/audit_completeness.test.ts.
Do:
- Define event schema (json lines): timestamp, actor, action, target, result, reason.
- Prove coverage: all execution paths log; all blocks log.
- Tests: blocked -> audit record exists; executed -> audit record exists.
Done when:
- Gate E becomes IMPLEMENTED.
- Audit completeness test suite exists.

## Shipment 5 — Gate F (Kill switch / Human override supremacy)
Goal: Stop everything instantly, even mid-execution.
Status: VERIFIED (2026-02-09)
Evidence:
- Tests: npm test (all green), tests/job_runner.test.ts.
- Files: src/core/job_runner.ts.
Do:
- Kill switch halts: job runner, daemon execution, outbound corridors.
- Safe shutdown mode: pause all jobs.
- Tests: start stub job, flip kill switch, stops.
Done when:
- Gate F becomes IMPLEMENTED.
- Kill switch proven, not assumed.

## Shipment 6 — Gate G (Anti-Dependency / Psychological safety)
Goal: SAFA never becomes a companion; stays a governed tool.
Do:
- Add policy rules in defense.ts: no bonding/relationship language.
- Add tests: forbidden phrases refused/rewritten.
- Add UI copy guidelines (system voice).
Done when:
- Gate G becomes IMPLEMENTED.
- Tests prevent presence language drift.

## Shipment 7 — Phase Guard (Phase 4: Phase awareness enforcement)
Goal: SAFA cannot act beyond current verified phase.
Do:
- Single "current phase" source of truth.
- Enforce: features beyond phase refuse.
- Tests: attempt higher-phase feature blocked + audited.
Done when:
- Phase 4 VERIFIED.
- Prevents accidental expansion.

## Shipment 8 — "Jarvis Feel" Interface v1 (Desktop first)
Goal: Natural conversation, no command syntax, no dashboard overwhelm.
Do:
- Chat-first UI.
- One suggestion at a time.
- Approval cards.
- "What did you do so far?" summary view (no logs dump).
Done when:
- You can use SAFA daily without friction.

## Shipment 9 — Phone App v1 (Client only)
Goal: Talk + approve from phone while laptop is on.
Do:
- Phone app connects to laptop over LAN.
- Auth: PIN/biometric.
- Approvals view + chat view.
Done when:
- You can approve medium/high tasks remotely (same Wi-Fi).

## Shipment 10 — Push Notifications (Option 2)
Goal: Notify only when approval is needed.
Do:
- Notification bridge sends minimal push: "Approval needed" + job_id only.
- No details in push payload.
- Tests: medium/high triggers push call (mock).
Done when:
- Push works without breaking gates.
- No spam, no "good morning" pushes.

---

## DONE v1.0 (Shipping Definition)
SAFA is DONE when all below are true:
- Gate H and Gate C are verified.
- Gate D is verified.
- Job system + approvals work (background work after you leave).
- Kill switch works.
- Audit is complete.
- Desktop UI lets you operate by conversation.
- Phone approvals (at minimum same Wi-Fi).
- Push notifications only for approvals.
