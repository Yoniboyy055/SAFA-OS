export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SkillRegistry } = require("../src/skills/registry");
const { sendEmailRequestSkill } = require("../src/skills/outbound/send_email_request");
const { requestPhoneCallSkill } = require("../src/skills/outbound/request_phone_call");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");

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

test("send_email_request produces a draft and audit event", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stub-"));
  const registry = new SkillRegistry();
  registry.register(sendEmailRequestSkill);
  const context = buildContext(rootDir);
  const result = await registry.execute(
    "send_email_request",
    { to: "user@example.com", subject: "Hello", body: "Draft body" },
    context
  );
  assert.equal(result.success, true);
  assert.ok(result.output.draftId);
  const log = fs.readFileSync(context.config.audit.logPath, "utf8");
  assert.ok(log.includes("send_email_request"));
});

test("request_phone_call produces a script and audit event", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stub-"));
  const registry = new SkillRegistry();
  registry.register(requestPhoneCallSkill);
  const context = buildContext(rootDir);
  const result = await registry.execute(
    "request_phone_call",
    { toNumber: "+15550002222", intent: "sales" },
    context
  );
  assert.equal(result.success, true);
  assert.ok(result.output.script);
  const log = fs.readFileSync(context.config.audit.logPath, "utf8");
  assert.ok(log.includes("request_phone_call"));
});
