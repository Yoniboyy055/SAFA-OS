export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Governor } = require("../src/core/governor");
const { AuditLogger, auditNetworkRequest } = require("../src/core/audit");
const { requestNetwork } = require("../src/core/network/client");
const { validateUrl } = require("../src/core/network/types");

function buildConfig(rootDir, overrides = {}) {
  return {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: []
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
}

function buildRequest(url = "https://example.com") {
  return {
    id: "req-1",
    purpose: "test",
    method: "GET",
    url,
    headers: {},
    bodySummary: "",
    bodyHash: "hash",
    riskLevel: "LOW",
    requiresApproval: false
  };
}

test("network disabled: governor denies and client throws", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, { network: { ...buildConfig(rootDir).network, enabled: false } });
  const governor = new Governor();
  const decision = governor.evaluateNetwork(
    buildRequest(),
    config,
    {
      actor: "tester",
      approved: true,
      authority: "OWNER",
      commandMode: "DECIDE",
      audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
      maturityLevel: 5,
      freshOwnerInput: true
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /disabled/i);

  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  await assert.rejects(
    () =>
      requestNetwork(buildRequest(), {
        actor: "tester",
        approved: true,
        authority: "OWNER",
        commandMode: "DECIDE",
        config,
        audit,
        governor
      }),
    /Network disabled/
  );
});

test("network enabled but allowlistDomains empty => deny", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: { enabled: true, allowlist: [], allowlistDomains: [], allowlistUrls: [] }
  });
  const governor = new Governor();
  const decision = governor.evaluateNetwork(
    buildRequest(),
    config,
    {
      actor: "tester",
      approved: true,
      authority: "OWNER",
      commandMode: "DECIDE",
      audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
      maturityLevel: 5,
      freshOwnerInput: true
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /allowlisted domains/i);
});

test("strict approval mode denies when not approved", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: { enabled: true, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] },
    governance: { strictApprovalMode: true, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 }
  });
  const governor = new Governor();
  const decision = governor.evaluateNetwork(
    buildRequest(),
    config,
    {
      actor: "tester",
      approved: false,
      authority: "OWNER",
      commandMode: "DECIDE",
      audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
      maturityLevel: 5,
      freshOwnerInput: true
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /strict approval/i);
});

test("validator denies non-https URL", () => {
  const decision = validateUrl("http://example.com", {
    allowlistDomains: ["example.com"],
    allowlistUrls: [],
    allowHttp: false,
    maxPayloadBytes: 16384
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /https/i);
});

test("allowlist domains allow exact and subdomain matches", () => {
  const exact = validateUrl("https://example.com/path", {
    allowlistDomains: ["example.com"],
    allowlistUrls: [],
    allowHttp: false,
    maxPayloadBytes: 16384
  });
  assert.equal(exact.allowed, true);

  const subdomain = validateUrl("https://api.example.com", {
    allowlistDomains: ["example.com"],
    allowlistUrls: [],
    allowHttp: false,
    maxPayloadBytes: 16384
  });
  assert.equal(subdomain.allowed, true);
});

test("allowlist urls require exact match", () => {
  const decision = validateUrl("https://example.com/path", {
    allowlistDomains: ["example.com"],
    allowlistUrls: ["https://example.com/path"],
    allowHttp: false,
    maxPayloadBytes: 16384
  });
  assert.equal(decision.allowed, true);

  const denied = validateUrl("https://example.com/other", {
    allowlistDomains: ["example.com"],
    allowlistUrls: ["https://example.com/path"],
    allowHttp: false,
    maxPayloadBytes: 16384
  });
  assert.equal(denied.allowed, false);
});

test("network client remains stub-only when allowed", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: { enabled: true, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] }
  });
  const governor = new Governor();
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  const response = await requestNetwork(buildRequest(), {
    actor: "tester",
    approved: true,
    authority: "OWNER",
    commandMode: "DECIDE",
    config,
    audit,
    governor
  });
  assert.equal(response.status, 0);
  assert.equal(response.responseHash, "stub");
});

test("audit redaction prevents authorization/cookie leakage", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const logPath = path.join(rootDir, "audit.log");
  const logger = new AuditLogger({ logPath, redactKeys: [] });

  auditNetworkRequest(
    logger,
    {
      url: "https://example.com",
      domain: "example.com",
      method: "GET",
      purpose: "test",
      approved: true,
      bodyHash: "hash",
      bodySummary: "",
      headers: {
        Authorization: "Bearer SECRET",
        cookie: "session=abc",
        "set-cookie": "token=xyz"
      }
    },
    "tester"
  );

  const line = fs.readFileSync(logPath, "utf8").trim();
  assert.ok(!line.includes("Bearer SECRET"));
  assert.ok(!line.includes("session=abc"));
  assert.ok(!line.includes("token=xyz"));
});
