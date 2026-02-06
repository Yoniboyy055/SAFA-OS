export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { requestNetwork } = require("../src/core/network/request");

const originalFetch = global.fetch;

function buildContext(rootDir, overrides = {}) {
  const config = {
    network: { enabled: true, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] },
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
  const context = buildContext(rootDir, { network: { enabled: false, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] } });
  await assert.rejects(
    () =>
      requestNetwork(
        { method: "GET", url: "https://example.com", purpose: "test" },
        context
      ),
    /Network disabled/
  );
});

test("deny when domain not allowlisted", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir, { network: { enabled: true, allowlist: [], allowlistDomains: ["allowed.com"], allowlistUrls: [] } });
  await assert.rejects(
    () =>
      requestNetwork(
        { method: "GET", url: "https://example.com", purpose: "test" },
        context
      ),
    /not allowlisted/i
  );
});

test("audit redacts Authorization header", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  global.fetch = async () => new Response("ok", { status: 200 });
  try {
    await requestNetwork(
      {
        method: "POST",
        url: "https://example.com",
        purpose: "test",
        headers: { Authorization: "Bearer SECRET" },
        body: "payload"
      },
      context
    );
    const log = fs.readFileSync(context.config.audit.logPath, "utf8");
    assert.ok(!log.includes("Bearer SECRET"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("payload size enforcement", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  const bigBody = "a".repeat(20000);
  await assert.rejects(
    () =>
      requestNetwork(
        {
          method: "POST",
          url: "https://example.com",
          purpose: "test",
          body: bigBody
        },
        context
      ),
    /Payload exceeds max/i
  );
});

test("response size enforcement", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  const largeBody = "x".repeat(300000);
  global.fetch = async () => new Response(largeBody, { status: 200 });
  try {
    await assert.rejects(
      () =>
        requestNetwork(
          { method: "GET", url: "https://example.com", purpose: "test" },
          context
        ),
      /Response exceeds maximum size/i
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("method allowlist enforces GET/POST", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  await assert.rejects(
    () =>
      requestNetwork(
        { method: "PUT", url: "https://example.com", purpose: "test" },
        context
      ),
    /Method not allowlisted/i
  );
});

test("uses mocked fetch and restores global", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  global.fetch = async () => new Response("ok", { status: 200 });
  try {
    const result = await requestNetwork(
      { method: "GET", url: "https://example.com", purpose: "test" },
      context
    );
    assert.equal(result.status, 200);
  } finally {
    global.fetch = originalFetch;
  }
});

