export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  appendVoiceLog,
  listVoiceLogs,
  getVoiceLog
} = require("../src/core/voice_log");

test("voice logs append and replay", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-voice-"));
  const entry = appendVoiceLog(rootDir, "Status check sk-SECRET");
  assert.ok(entry.id);
  assert.equal(entry.intent, "status");
  assert.equal(entry.redacted, true);

  const logs = listVoiceLogs(rootDir);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].id, entry.id);

  const replay = getVoiceLog(rootDir, entry.id);
  assert.equal(replay.id, entry.id);
  assert.ok(replay.transcript.includes("REDACTED"));
});
