export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { VoiceLogStore } = require("../src/core/voice/voice_store");
const { parseVoiceTranscript } = require("../src/core/voice/voice_parser");

test("voice log store appends and lists entries", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-voice-"));
  const store = new VoiceLogStore(rootDir);
  const parsed = parseVoiceTranscript("plan update the roadmap");
  store.append({
    id: "voice-1",
    actor: "tester",
    transcript: "plan update the roadmap",
    parsed,
    createdAt: new Date().toISOString()
  });
  const entries = store.list(10);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].parsed.intent, "plan");
});
