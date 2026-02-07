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
  assert.throws(() => createOutreachPlan(), /Phase 7B is locked/i);
  assert.throws(() => createMessageFlow(), /Phase 7B is locked/i);
  assert.throws(() => initiateCallFlow(), /Phase 7B is locked/i);
  assert.throws(() => negotiateIntent(), /Phase 7B is locked/i);
  assert.throws(() => switchIdentityContext(), /Phase 7B is locked/i);
});
