export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnAgent } = require("../src/core/layer4/spawn");

test("layer 4 spawning is disabled", () => {
  assert.throws(() => spawnAgent({ name: "agent", purpose: "test" }), /LOCKED: Layer 4 disabled/i);
});
