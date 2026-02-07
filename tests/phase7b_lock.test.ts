export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createOutreachPlan,
  createMessageFlow,
  initiateCallFlow,
  negotiateIntent,
  switchIdentityContext
} = require("../src/core/phase7b/locked");

test("phase 7B modules are locked", () => {
  assert.throws(() => createOutreachPlan(), /LOCKED: Phase 7B not activated/i);
  assert.throws(() => createMessageFlow(), /LOCKED: Phase 7B not activated/i);
  assert.throws(() => initiateCallFlow(), /LOCKED: Phase 7B not activated/i);
  assert.throws(() => negotiateIntent(), /LOCKED: Phase 7B not activated/i);
  assert.throws(() => switchIdentityContext(), /LOCKED: Phase 7B not activated/i);
});
