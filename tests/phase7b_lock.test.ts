export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createOutreachPlan,
  createMessageFlow,
  scheduleWorkflow,
  startScheduler,
  initiateCallFlow,
  negotiateIntent,
  executeBusinessLogic,
  switchIdentityContext
} = require("../src/core/phase7b/locked");

test("phase 7B modules are locked", () => {
  assert.throws(() => createOutreachPlan(), /PHASE_7B_LOCKED/i);
  assert.throws(() => createMessageFlow(), /PHASE_7B_LOCKED/i);
  assert.throws(() => scheduleWorkflow(), /PHASE_7B_LOCKED/i);
  assert.throws(() => startScheduler(), /PHASE_7B_LOCKED/i);
  assert.throws(() => initiateCallFlow(), /PHASE_7B_LOCKED/i);
  assert.throws(() => negotiateIntent(), /PHASE_7B_LOCKED/i);
  assert.throws(() => executeBusinessLogic(), /PHASE_7B_LOCKED/i);
  assert.throws(() => switchIdentityContext(), /PHASE_7B_LOCKED/i);
});
