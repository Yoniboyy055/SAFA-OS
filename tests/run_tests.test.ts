export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runTestsSkill } = require("../src/skills/local/run_tests");
const { AuthorityLevel } = require("../src/core/authority");

function buildContext(rootDir: string, overrides: Record<string, unknown> = {}) {
  const config = {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: [],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    },
    telemetry: { enabled: false },
    killSwitch: { enabled: false },
    governance: {
      strictApprovalMode: false,
      networkApprovalMode: "per_request",
      maxNetworkPayloadBytes: 16384
    },
    email: {
      enabled: false,
      provider: "smtp",
      fromAllowlist: [],
      toAllowlist: [],
      domainAllowlist: [],
      dryRunDefault: true,
      from: "",
      smtp: { host: "smtp.gmail.com", port: 587, secure: false }
    },
    stripe: {
      enabled: false,
      dryRunDefault: true,
      apiBase: "https://api.stripe.com",
      mode: "production",
      statementDescriptor: "SIGNALCRYPT",
      successUrl: "",
      cancelUrl: ""
    },
    calls: {
      enabled: false,
      provider: "twilio",
      fromNumberAllowlist: [],
      toNumberAllowlist: [],
      countryAllowlist: [],
      twimlUrl: "",
      recordCalls: false,
      dryRunDefault: true
    },
    audit: { logPath: path.join(rootDir, "audit.log"), redactKeys: [] },
    permissions: {
      writeAllowlist: [],
      readAllowlist: [],
      stripePriceAllowlist: [],
      stripeAmountAllowlist: [],
      stripeCurrencyAllowlist: ["usd"],
      stripeCustomerEmailAllowlist: [],
      emailSubjectAllowlist: [],
      emailTemplateAllowlist: [],
      callIntentAllowlist: ["sales", "support", "follow_up", "payment"],
      callTemplateAllowlist: []
    },
    rootDir,
    configPath: path.join(rootDir, "jarvis.config.json"),
    ...overrides
  };
  return {
    config,
    actor: "tester",
    approved: true,
    authority: AuthorityLevel.OWNER,
    commandMode: "SCRIPT",
    audit: { log: () => {} },
    governor: { evaluate: () => ({ allowed: true, reason: "Allowed." }) }
  };
}

test("run_tests loads compiled test modules", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-run-"));
  const testsDir = path.join(rootDir, "dist", "tests");
  fs.mkdirSync(testsDir, { recursive: true });
  const testFile = path.join(testsDir, "sample.test.js");
  fs.writeFileSync(
    testFile,
    "const { test } = require('node:test'); test('sample', () => {});",
    "utf8"
  );

  const result = await runTestsSkill.handler({ path: "dist/tests" }, buildContext(rootDir));
  assert.equal(result.loaded, 1);
  assert.equal(result.files.length, 1);
  assert.ok(result.files[0].endsWith("sample.test.js"));
});

test("run_tests respects kill switch", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-run-"));
  const testsDir = path.join(rootDir, "dist", "tests");
  fs.mkdirSync(testsDir, { recursive: true });
  const testFile = path.join(testsDir, "sample.test.js");
  fs.writeFileSync(
    testFile,
    "const { test } = require('node:test'); test('sample', () => {});",
    "utf8"
  );

  const context = buildContext(rootDir, {
    killSwitch: { enabled: true }
  });
  await assert.rejects(
    () => runTestsSkill.handler({ path: "dist/tests" }, context),
    /Kill switch/i
  );
});

test("run_tests returns note when no test files exist", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-run-"));
  const result = await runTestsSkill.handler({}, buildContext(rootDir));
  assert.equal(result.loaded, 0);
  assert.ok(result.note);
});
