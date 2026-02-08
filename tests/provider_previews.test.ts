export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { previewPaymentIntent } = require("../src/core/stripe/preview");
const { previewSend } = require("../src/core/email/preview");
const { previewDial } = require("../src/core/calls/preview");
const { previewPublish } = require("../src/core/post/preview");

function buildContext(rootDir: string, overrides: Record<string, unknown> = {}) {
  const config = {
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
    governance: { strictApprovalMode: false, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 },
    email: {
      enabled: false,
      provider: "smtp",
      fromAllowlist: ["*@example.com"],
      toAllowlist: ["*@allow.com"],
      domainAllowlist: [],
      dryRunDefault: true,
      from: "Test <test@example.com>",
      smtp: { host: "smtp.gmail.com", port: 587, secure: false }
    },
    stripe: {
      enabled: false,
      dryRunDefault: true,
      apiBase: "https://api.stripe.com",
      mode: "production",
      statementDescriptor: "SIGNALCRYPT",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel"
    },
    calls: {
      enabled: false,
      provider: "twilio",
      fromNumberAllowlist: ["+15550001111"],
      toNumberAllowlist: ["+15550002222"],
      countryAllowlist: ["+1"],
      twimlUrl: "https://example.com/twiml",
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
      emailSubjectAllowlist: ["Subject"],
      emailTemplateAllowlist: [],
      callIntentAllowlist: ["sales", "support", "follow_up", "payment"],
      callTemplateAllowlist: ["https://example.com/twiml"]
    },
    rootDir,
    configPath: path.join(rootDir, "safa.config.json"),
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

test("post preview requires approval", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-prev-"));
  const context = buildContext(rootDir);
  assert.throws(
    () =>
      previewPublish(
        { channel: "x.com", content: "Hello world" },
        { ...context, approved: false }
      ),
    /approval required/i
  );
});

test("stripe preview returns plan + cost estimate", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-prev-"));
  const context = buildContext(rootDir);
  const result = await previewPaymentIntent(
    { priceId: "price_basic", currency: "usd", customerEmail: "user@allow.com" },
    context
  );
  assert.ok(result.previewHash);
  assert.equal(result.costEstimateUsd, 0);
  assert.ok(result.plan.url);
});

test("email preview returns outbox path", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-prev-"));
  const context = buildContext(rootDir);
  const result = await previewSend(
    { to: ["user@allow.com"], subject: "Subject", body: "Draft" },
    context
  );
  assert.equal(result.costEstimateUsd, 0);
  assert.ok(result.outboxPath);
});

test("call preview returns plan", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-prev-"));
  const context = buildContext(rootDir);
  const result = await previewDial(
    { toNumber: "+15550002222", intent: "sales" },
    context
  );
  assert.ok(result.previewHash);
  assert.ok(result.plan.url);
});
