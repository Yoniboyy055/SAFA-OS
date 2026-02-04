const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeFileSkill } = require("../src/skills/local/write_file");

function buildConfig(rootDir) {
  return {
    network: { enabled: false, allowlist: [] },
    telemetry: { enabled: false },
    killSwitch: { enabled: false },
    governance: { strictApprovalMode: false },
    audit: { logPath: path.join(rootDir, "logs/audit.log"), redactKeys: [] },
    permissions: { writeAllowlist: [rootDir], readAllowlist: [rootDir] },
    rootDir,
    configPath: path.join(rootDir, "jarvis.config.json")
  };
}

function buildContext(rootDir) {
  return { config: buildConfig(rootDir), actor: "tester" };
}

test("write_file rejects absolute paths", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-write-"));
  const context = buildContext(rootDir);
  const absolutePath = path.join(rootDir, "data", "abs.txt");
  assert.throws(() => {
    writeFileSkill.handler(
      { path: absolutePath, content: "data", createDirs: true },
      context
    );
  }, /absolute paths/i);
});

test("write_file rejects traversal paths", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-write-"));
  const context = buildContext(rootDir);
  assert.throws(() => {
    writeFileSkill.handler(
      { path: "../outside.txt", content: "data", createDirs: true },
      context
    );
  }, /traversal/i);
});

test("write_file rejects symlink escapes", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-write-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-outside-"));
  fs.mkdirSync(path.join(rootDir, "data"), { recursive: true });
  fs.symlinkSync(outsideDir, path.join(rootDir, "data", "escape"), "dir");
  const context = buildContext(rootDir);
  assert.throws(() => {
    writeFileSkill.handler(
      { path: "data/escape/evil.txt", content: "data", createDirs: true },
      context
    );
  }, /escapes root|root directory/i);
});

test("write_file blocks protected directories and root files", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-write-"));
  const context = buildContext(rootDir);
  assert.throws(() => {
    writeFileSkill.handler(
      { path: "governance/blocked.txt", content: "data", createDirs: true },
      context
    );
  }, /protected path/i);
  assert.throws(() => {
    writeFileSkill.handler(
      { path: "README.md", content: "data", overwrite: true },
      context
    );
  }, /protected path/i);
});
