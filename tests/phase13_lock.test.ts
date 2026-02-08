export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  runClientIntake,
  runNegotiationFlow,
  runFollowUpFlow
} = require("../src/core/phase13/locked");

test("phase 13 business ops are locked", () => {
  assert.throws(() => runClientIntake(), /PHASE_13_LOCKED/i);
  assert.throws(() => runNegotiationFlow(), /PHASE_13_LOCKED/i);
  assert.throws(() => runFollowUpFlow(), /PHASE_13_LOCKED/i);
});
