export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { requestNetwork } = require("../src/core/network/client");

function buildContext(rootDir, overrides = {}) {
  const config = {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    },
    telemetry: { enabled: false },
    killSwitch: { enabled: false },
    governance: { strictApprovalMode: false, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 },
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
    actor: "tester",
    approved: true,
    authority: AuthorityLevel.OWNER,
    commandMode: "DECIDE",
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

test("deny when network OFF", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir, {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  await assert.rejects(
    () =>
      requestNetwork(
        {
          id: "req-1",
          purpose: "test",
          method: "GET",
          url: "https://example.com",
          headers: {},
          bodySummary: "",
          bodyHash: "hash",
          riskLevel: "HIGH",
          requiresApproval: true
        },
        context
      ),
    /disabled/i
  );
});

test("deny when domain not allowlisted", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["allowed.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  await assert.rejects(
    () =>
      requestNetwork(
        {
          id: "req-2",
          purpose: "test",
          method: "GET",
          url: "https://example.com",
          headers: {},
          bodySummary: "",
          bodyHash: "hash",
          riskLevel: "HIGH",
          requiresApproval: true
        },
        context
      ),
    /not allowlisted/i
  );
});

test("payload size enforcement", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  const bigBody = "a".repeat(20000);
  await assert.rejects(
    () =>
      requestNetwork(
        {
          id: "req-3",
          purpose: "test",
          method: "POST",
          url: "https://example.com",
          headers: {},
          bodySummary: bigBody,
          bodyHash: "hash",
          riskLevel: "HIGH",
          requiresApproval: true
        },
        context
      ),
    /Payload exceeds max/i
  );
});

test("method allowlist enforces GET/POST", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  await assert.rejects(
    () =>
      requestNetwork(
        {
          id: "req-4",
          purpose: "test",
          method: "PUT",
          url: "https://example.com",
          headers: {},
          bodySummary: "",
          bodyHash: "hash",
          riskLevel: "HIGH",
          requiresApproval: true
        },
        context
      ),
    /Method not allowlisted/i
  );
});

test("allowlisted request returns stub response", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  const result = await requestNetwork(
    {
      id: "req-5",
      purpose: "test",
      method: "GET",
      url: "https://example.com",
      headers: {},
      bodySummary: "",
      bodyHash: "hash",
      riskLevel: "HIGH",
      requiresApproval: true
    },
    context
  );
  assert.equal(result.status, 0);
  assert.equal(result.responseHash, "stub");
});

