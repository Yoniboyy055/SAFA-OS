export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { makeCall } = require("../src/core/calls/client");

const originalFetch = global.fetch;

function buildContext(rootDir, overrides = {}) {
  const config = {
    network: { enabled: true, allowlist: [], allowlistDomains: ["twilio.com"], allowlistUrls: [] },
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
      enabled: true,
      provider: "twilio",
      fromNumberAllowlist: ["+15550001111"],
      toNumberAllowlist: ["+15550002222"],
      countryAllowlist: ["+1"],
      twimlUrl: "https://example.com/twiml",
      recordCalls: false,
      dryRunDefault: false
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
      callTemplateAllowlist: ["https://example.com/twiml"]
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

test("live call uses corridor fetch and redacts auth", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-call-"));
  process.env.TWILIO_ACCOUNT_SID = "AC123";
  process.env.TWILIO_AUTH_TOKEN = "token123";
  process.env.TWILIO_FROM_NUMBER = "+15550001111";
  global.fetch = async () =>
    new Response(JSON.stringify({ sid: "CA123" }), { status: 201 });

  const result = await makeCall(
    { toNumber: "+15550002222", intent: "sales", dryRun: false },
    buildContext(rootDir)
  );
  assert.equal(result.mode, "CREATED");
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(!log.includes("token123"));
  global.fetch = originalFetch;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
});

test("deny when api.twilio.com not allowlisted", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-call-"));
  process.env.TWILIO_ACCOUNT_SID = "AC123";
  process.env.TWILIO_AUTH_TOKEN = "token123";
  process.env.TWILIO_FROM_NUMBER = "+15550001111";
  const context = buildContext(rootDir, {
    network: { enabled: true, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] }
  });
  await assert.rejects(
    () =>
      makeCall(
        { toNumber: "+15550002222", intent: "sales", dryRun: false },
        context
      ),
    /allowlisted/
  );
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
});

test("dryRun never calls fetch", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-call-"));
  let called = false;
  global.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  const result = await makeCall(
    { toNumber: "+15550002222", intent: "sales", dryRun: true },
    buildContext(rootDir)
  );
  assert.equal(result.mode, "DRY_RUN");
  assert.equal(called, false);
  global.fetch = originalFetch;
});
