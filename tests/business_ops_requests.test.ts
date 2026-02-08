export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const {
  requestClientIntakeSkill
} = require("../src/skills/requests/request_client_intake");
const {
  requestNegotiationScriptSkill
} = require("../src/skills/requests/request_negotiation_script");
const {
  requestFollowUpSkill
} = require("../src/skills/requests/request_follow_up");

function buildConfig(rootDir: string) {
  return {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: [],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    },
    telemetry: { enabled: false },
    killSwitch: { enabled: true },
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
    audit: { logPath: path.join(rootDir, "logs/audit.log"), redactKeys: [] },
    permissions: {
      writeAllowlist: [rootDir, "data"],
      readAllowlist: [rootDir],
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
    configPath: path.join(rootDir, "safa.config.json")
  };
}

function buildContext(rootDir: string) {
  const config = buildConfig(rootDir);
  return {
    actor: "tester",
    approved: true,
    authority: AuthorityLevel.OWNER,
    commandMode: "SCRIPT",
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

test("client intake request creates artifact", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-biz-"));
  const context = buildContext(rootDir);
  const result = requestClientIntakeSkill.handler(
    { clientName: "Acme", summary: "New project" },
    context
  );
  assert.ok(fs.existsSync(result.artifactPath));
});

test("negotiation script request creates artifact", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-biz-"));
  const context = buildContext(rootDir);
  const result = requestNegotiationScriptSkill.handler(
    { counterpart: "Vendor", objective: "Renew contract" },
    context
  );
  assert.ok(fs.existsSync(result.artifactPath));
});

test("follow-up request creates artifact", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-biz-"));
  const context = buildContext(rootDir);
  const result = requestFollowUpSkill.handler(
    { recipient: "Client", purpose: "Check-in" },
    context
  );
  assert.ok(fs.existsSync(result.artifactPath));
});
