export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  loadSettings,
  updateSettings,
  setSetting
} = require("../src/core/settings_store");

test("settings store writes and merges values", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-settings-"));
  const first = updateSettings(rootDir, { mode: "auto" });
  assert.equal(first.values.mode, "auto");
  const second = setSetting(rootDir, "theme", "glass");
  assert.equal(second.values.mode, "auto");
  assert.equal(second.values.theme, "glass");

  const loaded = loadSettings(rootDir);
  assert.equal(loaded.values.mode, "auto");
  assert.equal(loaded.values.theme, "glass");

  const filePath = path.join(rootDir, "data", "settings.json");
  assert.ok(fs.existsSync(filePath));
});
