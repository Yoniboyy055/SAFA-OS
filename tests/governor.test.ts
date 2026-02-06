export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Governor } = require("../src/core/governor");
const { AuditLogger } = require("../src/core/audit");
const { AuthorityLevel } = require("../src/core/authority");

const baseConfig = {
  network: { enabled: false, allowlist: [], allowlistDomains: [], allowlistUrls: [] },
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
  audit: { logPath: "/tmp/audit.log", redactKeys: [] },
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
  rootDir: "/tmp",
  configPath: "/tmp/jarvis.config.json"
};

test("governor blocks outbound when kill switch enabled", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "network_call",
      category: "network",
      riskLevel: "LOW",
      requiresApproval: false,
      allowWhenNetworkOff: false
    },
    { ...baseConfig, killSwitch: { enabled: true } },
    {
      actor: "tester",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "DECIDE",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /kill switch/i);
});

test("governor requires approval for risky actions", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "write_file",
      category: "local",
      riskLevel: "HIGH",
      requiresApproval: false,
      allowWhenNetworkOff: true
    },
    baseConfig,
    {
      actor: "tester",
      approved: false,
      authority: AuthorityLevel.OWNER,
      commandMode: "DECIDE",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /approval required/i);
});

test("governor allows low-risk local actions", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "list_files",
      category: "local",
      riskLevel: "LOW",
      requiresApproval: false,
      allowWhenNetworkOff: true
    },
    baseConfig,
    {
      actor: "tester",
      approved: false,
      authority: AuthorityLevel.OWNER,
      commandMode: "DECIDE",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true
    }
  );
  assert.equal(decision.allowed, true);
});

test("strict approval mode requires approval for low risk", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "list_files",
      category: "local",
      riskLevel: "LOW",
      requiresApproval: false,
      allowWhenNetworkOff: true
    },
    { ...baseConfig, governance: { strictApprovalMode: true } },
    {
      actor: "tester",
      approved: false,
      authority: AuthorityLevel.OWNER,
      commandMode: "DECIDE",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /strict approval/i);
});
