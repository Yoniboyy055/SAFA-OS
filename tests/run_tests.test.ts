export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runTestsSkill } = require("../src/skills/local/run_tests");

function buildContext(rootDir) {
  return {
    config: {
      network: { enabled: false, allowlist: [], allowlistDomains: [], allowlistUrls: [] },
      telemetry: { enabled: false },
      killSwitch: { enabled: false },
      governance: {
        strictApprovalMode: false,
        networkApprovalMode: "per_request",
        maxNetworkPayloadBytes: 16384
      },
      email: {
        enabled: false,
        dryRunDefault: true,
        from: "",
        smtp: { host: "smtp.gmail.com", port: 587, secure: false }
      },
      audit: { logPath: path.join(rootDir, "audit.log"), redactKeys: [] },
      permissions: {
        writeAllowlist: [],
        readAllowlist: [],
        emailRecipientAllowlist: [],
        emailRecipientDenylist: []
      },
      rootDir,
      configPath: path.join(rootDir, "jarvis.config.json")
    },
    actor: "tester",
    approved: true,
    audit: { log: () => {} },
    governor: { evaluate: () => ({ allowed: true, reason: "Allowed." }) }
  };
}

test("run_tests loads compiled test modules", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-run-"));
  const testsDir = path.join(rootDir, "dist", "tests");
  fs.mkdirSync(testsDir, { recursive: true });
  const testFile = path.join(testsDir, "sample.test.js");
  fs.writeFileSync(testFile, "module.exports = { loaded: true };", "utf8");

  const result = await runTestsSkill.handler({ path: "dist/tests" }, buildContext(rootDir));
  assert.equal(result.loaded, 1);
  assert.equal(result.files.length, 1);
  assert.ok(result.files[0].endsWith("sample.test.js"));
});

test("run_tests returns note when no test files exist", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-run-"));
  const result = await runTestsSkill.handler({}, buildContext(rootDir));
  assert.equal(result.loaded, 0);
  assert.ok(result.note);
});
