export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { requestPaymentSkill } = require("../src/skills/outbound/request_payment");

function buildContext(rootDir, overrides = {}) {
  const config = {
    network: { enabled: false, allowlist: [], allowlistDomains: [], allowlistUrls: [] },
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
      stripePriceAllowlist: ["price_basic"],
      stripeAmountAllowlist: ["5000"],
      stripeCurrencyAllowlist: ["usd"],
      stripeCustomerEmailAllowlist: ["*@allow.com"],
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
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

test("deny when network OFF for real request", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pay-"));
  const context = buildContext(rootDir, {
    stripe: { enabled: true, dryRunDefault: false, apiBase: "https://api.stripe.com", mode: "production", statementDescriptor: "SIGNALCRYPT", successUrl: "", cancelUrl: "" },
    network: { enabled: false, allowlist: [], allowlistDomains: [], allowlistUrls: [] }
  });
  await assert.rejects(
    () =>
      requestPaymentSkill.handler(
        { priceId: "price_basic", currency: "usd", customerEmail: "user@allow.com", dryRun: false },
        context
      ),
    /Network disabled/
  );
});

test("deny when allowlists fail", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pay-"));
  const context = buildContext(rootDir);
  await assert.rejects(
    () =>
      requestPaymentSkill.handler(
        { priceId: "price_denied", currency: "usd", customerEmail: "user@allow.com", dryRun: true },
        context
      ),
    /not allowlisted/i
  );
});

test("dryRun returns preview", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pay-"));
  const context = buildContext(rootDir);
  const result = await requestPaymentSkill.handler(
    { priceId: "price_basic", currency: "usd", customerEmail: "user@allow.com", dryRun: true },
    context
  );
  assert.equal(result.mode, "DRY_RUN");
  assert.ok(result.previewHash);
});

test("approval required for real actions", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pay-"));
  const context = buildContext(rootDir, {
    stripe: { enabled: true, dryRunDefault: false, apiBase: "https://api.stripe.com", mode: "production", statementDescriptor: "SIGNALCRYPT", successUrl: "", cancelUrl: "" },
    network: { enabled: true, allowlist: [], allowlistDomains: ["stripe.com"], allowlistUrls: [] }
  });
  await assert.rejects(
    () =>
      requestPaymentSkill.handler(
        { priceId: "price_basic", currency: "usd", customerEmail: "user@allow.com", dryRun: false },
        { ...context, approved: false }
      ),
    /approval required|strict approval/i
  );
});

test("audit does not log secrets", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pay-"));
  process.env.STRIPE_SECRET_KEY = "sk_test_secret";
  const context = buildContext(rootDir);
  await requestPaymentSkill.handler(
    { priceId: "price_basic", currency: "usd", customerEmail: "user@allow.com", description: "BODY_SECRET", dryRun: true },
    context
  );
  const log = fs.readFileSync(context.config.audit.logPath, "utf8");
  assert.ok(!log.includes("sk_test_secret"));
  assert.ok(!log.includes("BODY_SECRET"));
  delete process.env.STRIPE_SECRET_KEY;
});
