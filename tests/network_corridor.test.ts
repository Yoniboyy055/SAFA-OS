export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Governor } = require("../src/core/governor");
const { AuditLogger, auditNetworkRequest } = require("../src/core/audit");
const { openNetworkWindow } = require("../src/core/network_window");
const { requestNetwork } = require("../src/core/network/client");
const { validateUrl } = require("../src/core/network/types");
const { SkillRegistry } = require("../src/skills/registry");
const { sendHttpRequestSkill } = require("../src/skills/network/send_http_request");

function buildConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
  return {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["example.com"],
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
    riskLevel: "HIGH",
    requiresApproval: true
  };
}

function buildSkillContext(rootDir: string, overrides: Record<string, unknown> = {}) {
  const config = buildConfig(rootDir, overrides);
  openNetworkWindow(rootDir, 6, "tester");
  return {
    actor: "tester",
    approved: true,
    authority: "OWNER",
    commandMode: "DECIDE",
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

test("network disabled denies send_http_request", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const registry = new SkillRegistry();
  registry.register(sendHttpRequestSkill);
  const context = buildSkillContext(rootDir, {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  const result = await registry.execute(
    "send_http_request",
    { method: "GET", url: "https://example.com" },
    context
  );
  assert.equal(result.success, false);
});

test("allowlist empty denies send_http_request", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const registry = new SkillRegistry();
  registry.register(sendHttpRequestSkill);
  const context = buildSkillContext(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: [],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  const result = await registry.execute(
    "send_http_request",
    { method: "GET", url: "https://example.com" },
    context
  );
  assert.equal(result.success, false);
});

test("allowlisted domain + approval returns stub response", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const registry = new SkillRegistry();
  registry.register(sendHttpRequestSkill);
  const context = buildSkillContext(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  const result = await registry.execute(
    "send_http_request",
    { method: "GET", url: "https://example.com" },
    context
  );
  assert.equal(result.success, true);
  assert.equal(result.output.status, 0);
});

test("network disabled: governor denies and client throws", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: { ...buildConfig(rootDir).network, enabled: false }
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
    /disabled/i
  );
});

test("network enabled but allowlistDomains empty => deny", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: [],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
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
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    },
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

test("approval required for outbound-intent requests", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    },
    governance: { strictApprovalMode: false, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 }
  });
  const governor = new Governor();
  const decision = governor.evaluateNetwork(
    {
      ...buildRequest(),
      requiresApproval: true
    },
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
  assert.match(decision.reason, /approval required/i);
});

test("payload limits deny oversized requests", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    },
    governance: { strictApprovalMode: false, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 8 }
  });
  const governor = new Governor();
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  await assert.rejects(
    () =>
      requestNetwork(
        {
          ...buildRequest(),
          bodySummary: "0123456789"
        },
        {
          actor: "tester",
          approved: true,
          authority: "OWNER",
          commandMode: "DECIDE",
          config,
          audit,
          governor
        }
      ),
    /payload/i
  );
});

test("kill switch blocks network corridor", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    },
    killSwitch: { enabled: true }
  });
  const governor = new Governor();
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
    /kill switch/i
  );
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

test("allowlisted domain executes only with approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
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
  const log = fs.readFileSync(config.audit.logPath, "utf8");
  assert.ok(log.includes("network.request"));
});

test("allowlisted domain denied without approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
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
  const governor = new Governor();
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  await assert.rejects(
    () =>
      requestNetwork(buildRequest(), {
        actor: "tester",
        approved: false,
        authority: "OWNER",
        commandMode: "DECIDE",
        config,
        audit,
        governor
      }),
    /approval/i
  );
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
