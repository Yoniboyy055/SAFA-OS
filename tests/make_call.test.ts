export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { makeCallSkill } = require("../src/skills/outbound/make_call");

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

test("deny real call execution when Phase 7B is locked", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-call-"));
  const context = buildContext(rootDir, {
    calls: { enabled: true, provider: "twilio", fromNumberAllowlist: ["+15550001111"], toNumberAllowlist: ["+15550002222"], countryAllowlist: ["+1"], twimlUrl: "https://example.com/twiml", recordCalls: false, dryRunDefault: false },
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["twilio.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  await assert.rejects(
    () =>
      makeCallSkill.handler(
        { toNumber: "+15550002222", intent: "sales", dryRun: false },
        context
      ),
    /PHASE_7B_LOCKED/i
  );
});

test("deny when allowlists fail", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-call-"));
  const context = buildContext(rootDir);
  await assert.rejects(
    () =>
      makeCallSkill.handler(
        { toNumber: "+15550009999", intent: "sales", dryRun: true },
        context
      ),
    /allowlist/i
  );
});

test("deny when twimlUrl missing or not allowlisted", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-call-"));
  const context = buildContext(rootDir, {
    calls: {
      enabled: false,
      provider: "twilio",
      fromNumberAllowlist: ["+15550001111"],
      toNumberAllowlist: ["+15550002222"],
      countryAllowlist: ["+1"],
      twimlUrl: "",
      recordCalls: false,
      dryRunDefault: true
    },
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
    }
  });
  await assert.rejects(
    () =>
      makeCallSkill.handler(
        { toNumber: "+15550002222", intent: "sales", dryRun: true },
        context
      ),
    /twiml/i
  );
});

test("dryRun returns preview", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-call-"));
  const context = buildContext(rootDir);
  const result = await makeCallSkill.handler(
    { toNumber: "+15550002222", intent: "sales", dryRun: true },
    context
  );
  assert.equal(result.mode, "DRY_RUN");
  assert.ok(result.previewHash);
});

test("approval required for previews in strict mode", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-call-"));
  const context = buildContext(rootDir, {
    governance: { strictApprovalMode: true, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 }
  });
  await assert.rejects(
    () =>
      makeCallSkill.handler(
        { toNumber: "+15550002222", intent: "sales", dryRun: true },
        { ...context, approved: false }
      ),
    /approval required|strict approval/i
  );
});

test("audit does not log notes body", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-call-"));
  const context = buildContext(rootDir);
  await makeCallSkill.handler(
    { toNumber: "+15550002222", intent: "sales", notes: "PRIVATE_NOTE", dryRun: true },
    context
  );
  const log = fs.readFileSync(context.config.audit.logPath, "utf8");
  assert.ok(!log.includes("PRIVATE_NOTE"));
});
