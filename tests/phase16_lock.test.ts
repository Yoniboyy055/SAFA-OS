export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  startBackgroundExecution,
  sendDesktopNotification,
  registerMobileCompanion
} = require("../src/core/phase16/locked");

test("phase 16 full OS features are locked", () => {
  assert.throws(() => startBackgroundExecution(), /PHASE_16_LOCKED/i);
  assert.throws(() => sendDesktopNotification(), /PHASE_16_LOCKED/i);
  assert.throws(() => registerMobileCompanion(), /PHASE_16_LOCKED/i);
});
