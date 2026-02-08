export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  activateNetworkWindow,
  registerLiveProvider
} = require("../src/core/phase15/locked");

test("phase 15 real network is locked", () => {
  assert.throws(() => activateNetworkWindow(), /PHASE_15_LOCKED/i);
  assert.throws(() => registerLiveProvider(), /PHASE_15_LOCKED/i);
});
