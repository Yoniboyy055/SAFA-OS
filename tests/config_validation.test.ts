export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const { validateConfig } = require("../src/core/config_validate");

function buildConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
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
      strictApprovalMode: true,
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
    execution: {
      enabled: false,
      allowCommands: [],
      maxRuntimeMs: 600000,
      allowlistPaths: []
    },
    audit: { logPath: path.join(rootDir, "logs", "audit.log"), redactKeys: [] },
    permissions: {
      writeAllowlist: [path.join(rootDir, "data")],
      readAllowlist: [path.join(rootDir, "data")],
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
}

test("validation blocks network without allowlists", () => {
  const rootDir = os.tmpdir();
  const config = buildConfig(rootDir, {
    network: { enabled: true, allowlistDomains: [], allowlistUrls: [] }
  });
  assert.throws(() => validateConfig(config), /allowlist/i);
});

test("validation blocks audit log outside logs", () => {
  const rootDir = os.tmpdir();
  const config = buildConfig(rootDir, {
    audit: { logPath: path.join(rootDir, "outside.log"), redactKeys: [] }
  });
  assert.throws(() => validateConfig(config), /audit log path/i);
});

test("validation blocks execution without allowlists", () => {
  const rootDir = os.tmpdir();
  const config = buildConfig(rootDir, {
    execution: { enabled: true, allowCommands: [], maxRuntimeMs: 600000, allowlistPaths: [] }
  });
  assert.throws(() => validateConfig(config), /allowCommands/i);
});

test("validation blocks email enabled without from", () => {
  const rootDir = os.tmpdir();
  const config = buildConfig(rootDir, {
    email: {
      enabled: true,
      provider: "smtp",
      fromAllowlist: [],
      toAllowlist: ["*@example.com"],
      domainAllowlist: [],
      dryRunDefault: true,
      from: "",
      smtp: { host: "smtp.gmail.com", port: 587, secure: false }
    }
  });
  assert.throws(() => validateConfig(config), /email.from/i);
});
