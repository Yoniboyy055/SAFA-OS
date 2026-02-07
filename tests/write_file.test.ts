export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeFileSkill } = require("../src/skills/local/write_file");

function buildConfig(rootDir: string) {
  return {
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
    audit: { logPath: path.join(rootDir, "logs/audit.log"), redactKeys: [] },
    permissions: {
      writeAllowlist: [rootDir],
      readAllowlist: [rootDir],
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
    configPath: path.join(rootDir, "jarvis.config.json")
  };
}

function buildContext(rootDir: string) {
  return {
    config: buildConfig(rootDir),
    actor: "tester",
    approved: true,
    authority: "OWNER",
    commandMode: "SCRIPT",
    audit: { log: () => {} },
    governor: { evaluate: () => ({ allowed: true, reason: "Allowed." }) }
  };
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

test("write_file rejects symlink escapes", (t: any) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-write-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-outside-"));
  fs.mkdirSync(path.join(rootDir, "data"), { recursive: true });
  try {
    fs.symlinkSync(outsideDir, path.join(rootDir, "data", "escape"), "dir");
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "EPERM" || code === "EACCES") {
      t.skip("Symlink creation not permitted on this platform.");
      return;
    }
    throw err;
  }
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
