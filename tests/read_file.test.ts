export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readFileSkill } = require("../src/skills/local/read_file");

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
    configPath: path.join(rootDir, "safa.config.json")
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

test("read_file rejects absolute paths", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-read-"));
  const absolutePath = path.join(rootDir, "data.txt");
  fs.writeFileSync(absolutePath, "data");
  const context = buildContext(rootDir);
  assert.throws(() => {
    readFileSkill.handler({ path: absolutePath }, context);
  }, /absolute paths/i);
});

test("read_file rejects traversal paths", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-read-"));
  const context = buildContext(rootDir);
  assert.throws(() => {
    readFileSkill.handler({ path: "../outside.txt" }, context);
  }, /traversal/i);
});

test("read_file rejects symlink escapes", (t: any) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-read-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-outside-"));
  fs.writeFileSync(path.join(outsideDir, "secret.txt"), "secret");
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
    readFileSkill.handler({ path: "data/escape/secret.txt" }, context);
  }, /escapes root|root directory/i);
});

test("read_file blocks .env files", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-read-"));
  fs.writeFileSync(path.join(rootDir, ".env"), "SECRET=1");
  const context = buildContext(rootDir);
  assert.throws(() => {
    readFileSkill.handler({ path: ".env" }, context);
  }, /env|git/i);
});
