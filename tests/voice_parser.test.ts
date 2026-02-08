export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseVoiceTranscript } = require("../src/core/voice/voice_parser");

test("voice parser extracts plan text", () => {
  const parsed = parseVoiceTranscript("plan launch checklist");
  assert.equal(parsed.intent, "plan");
  assert.equal(parsed.commandText, "launch checklist");
  assert.ok(parsed.suggestedLine.includes("JARVIS: PLAN"));
});
