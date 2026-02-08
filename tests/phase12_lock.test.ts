export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { connectLiveModel, startAutoRoute } = require("../src/core/phase12/locked");

test("phase 12 live adapters are locked", () => {
  assert.throws(() => connectLiveModel(), /PHASE_12_LOCKED/i);
  assert.throws(() => startAutoRoute(), /PHASE_12_LOCKED/i);
});
