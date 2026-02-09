export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { assertNetworkGate } = require("../src/core/network/gate");

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
    configPath: path.join(rootDir, "safa.config.json"),
    ...overrides
  };
}

function readLastAuditLine(logPath: string) {
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

test("network gate blocks when network disabled", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-net-gate-"));
  const config = buildConfig(rootDir, {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  assert.throws(
    () => assertNetworkGate(config, audit, "tester", "https://example.com"),
    /Network disabled/i
  );
  const entry = readLastAuditLine(config.audit.logPath);
  assert.equal(entry.action, "network.blocked");
  assert.match(entry.result, /Network disabled/i);
});

test("network gate blocks wildcard allowlist", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-net-gate-"));
  const config = buildConfig(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["*"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  assert.throws(
    () => assertNetworkGate(config, audit, "tester", "https://example.com"),
    /wildcard/i
  );
  const entry = readLastAuditLine(config.audit.logPath);
  assert.equal(entry.action, "network.blocked");
  assert.match(entry.result, /wildcard/i);
});

test("network gate blocks empty allowlist entry", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-net-gate-"));
  const config = buildConfig(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: [""],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  assert.throws(
    () => assertNetworkGate(config, audit, "tester", "https://example.com"),
    /empty/i
  );
  const entry = readLastAuditLine(config.audit.logPath);
  assert.equal(entry.action, "network.blocked");
  assert.match(entry.result, /empty/i);
});

test("network gate allows allowlisted host", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-net-gate-"));
  const config = buildConfig(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  assert.doesNotThrow(() => assertNetworkGate(config, audit, "tester", "https://example.com"));
});
