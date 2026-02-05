export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { requestPayment } = require("../src/core/stripe/client");

const originalFetch = global.fetch;

function buildContext(rootDir, overrides = {}) {
  const config = {
    network: { enabled: true, allowlist: [], allowlistDomains: ["stripe.com"], allowlistUrls: [] },
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
      enabled: true,
      dryRunDefault: false,
      apiBase: "https://api.stripe.com",
      mode: "production",
      statementDescriptor: "SIGNALCRYPT",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel"
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

test("live stripe request uses corridor fetch and redacts auth", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stripe-"));
  process.env.STRIPE_SECRET_KEY = "sk_test_secret";
  global.fetch = async () =>
    new Response(JSON.stringify({ id: "cs_test_123", url: "https://stripe.test/checkout" }), { status: 200 });

  const result = await requestPayment(
    { priceId: "price_basic", currency: "usd", customerEmail: "user@allow.com", dryRun: false },
    buildContext(rootDir)
  );
  assert.equal(result.mode, "CREATED");
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(!log.includes("sk_test_secret"));
  global.fetch = originalFetch;
  delete process.env.STRIPE_SECRET_KEY;
});

test("deny when api.stripe.com not allowlisted", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stripe-"));
  process.env.STRIPE_SECRET_KEY = "sk_test_secret";
  const context = buildContext(rootDir, {
    network: { enabled: true, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] }
  });
  await assert.rejects(
    () =>
      requestPayment(
        { priceId: "price_basic", currency: "usd", customerEmail: "user@allow.com", dryRun: false },
        context
      ),
    /allowlisted/
  );
  delete process.env.STRIPE_SECRET_KEY;
});

test("dryRun never calls fetch", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stripe-"));
  let called = false;
  global.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  const result = await requestPayment(
    { priceId: "price_basic", currency: "usd", customerEmail: "user@allow.com", dryRun: true },
    buildContext(rootDir)
  );
  assert.equal(result.mode, "DRY_RUN");
  assert.equal(called, false);
  global.fetch = originalFetch;
});
