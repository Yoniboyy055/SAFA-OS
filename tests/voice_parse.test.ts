export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseVoiceText } = require("../src/core/voice");

test("voice parser extracts intents", () => {
  assert.equal(parseVoiceText("Status").intent, "status");
  assert.equal(parseVoiceText("Plan my week").intent, "plan");
  assert.equal(parseVoiceText("Search logs").intent, "search");
  assert.equal(parseVoiceText("Read docs/README.md").intent, "read");
});
