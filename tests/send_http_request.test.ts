export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SkillRegistry } = require("../src/skills/registry");
const { sendHttpRequestSkill } = require("../src/skills/network/send_http_request");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");

function buildContext(rootDir: string, overrides: Record<string, unknown> = {}) {
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

test("send_http_request denied when network OFF", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-http-"));
  const registry = new SkillRegistry();
  registry.register(sendHttpRequestSkill);
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
  const result = await registry.execute(
    "send_http_request",
    { method: "GET", url: "https://example.com" },
    context
  );
  assert.equal(result.success, false);
});

test("send_http_request allows allowlisted domain with approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-http-"));
  const registry = new SkillRegistry();
  registry.register(sendHttpRequestSkill);
  const context = buildContext(rootDir);
  const result = await registry.execute(
    "send_http_request",
    { method: "GET", url: "https://example.com" },
    context
  );
  assert.equal(result.success, true);
  const log = fs.readFileSync(context.config.audit.logPath, "utf8");
  assert.ok(log.includes("send_http_request"));
});

test("send_http_request denied without approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-http-"));
  const registry = new SkillRegistry();
  registry.register(sendHttpRequestSkill);
  const context = buildContext(rootDir);
  const result = await registry.execute(
    "send_http_request",
    { method: "GET", url: "https://example.com" },
    { ...context, approved: false }
  );
  assert.equal(result.success, false);
});

test("send_http_request blocked by kill switch", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-http-"));
  const registry = new SkillRegistry();
  registry.register(sendHttpRequestSkill);
  const context = buildContext(rootDir, {
    killSwitch: { enabled: true }
  });
  const result = await registry.execute(
    "send_http_request",
    { method: "GET", url: "https://example.com" },
    context
  );
  assert.equal(result.success, false);
});
