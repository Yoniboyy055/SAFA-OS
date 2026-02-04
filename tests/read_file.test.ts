const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readFileSkill } = require("../src/skills/local/read_file");

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

test("read_file rejects absolute paths", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-read-"));
  const absolutePath = path.join(rootDir, "data.txt");
  fs.writeFileSync(absolutePath, "data");
  const context = buildContext(rootDir);
  assert.throws(() => {
    readFileSkill.handler({ path: absolutePath }, context);
  }, /absolute paths/i);
});

test("read_file rejects traversal paths", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-read-"));
  const context = buildContext(rootDir);
  assert.throws(() => {
    readFileSkill.handler({ path: "../outside.txt" }, context);
  }, /traversal/i);
});

test("read_file rejects symlink escapes", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-read-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-outside-"));
  fs.writeFileSync(path.join(outsideDir, "secret.txt"), "secret");
  fs.mkdirSync(path.join(rootDir, "data"), { recursive: true });
  fs.symlinkSync(outsideDir, path.join(rootDir, "data", "escape"), "dir");
  const context = buildContext(rootDir);
  assert.throws(() => {
    readFileSkill.handler({ path: "data/escape/secret.txt" }, context);
  }, /escapes root|root directory/i);
});

test("read_file blocks .env files", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-read-"));
  fs.writeFileSync(path.join(rootDir, ".env"), "SECRET=1");
  const context = buildContext(rootDir);
  assert.throws(() => {
    readFileSkill.handler({ path: ".env" }, context);
  }, /env|git/i);
});
