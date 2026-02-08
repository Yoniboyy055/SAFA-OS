export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Governor } = require("../src/core/governor");
const { AuditLogger } = require("../src/core/audit");
const { AuthorityLevel } = require("../src/core/authority");

const baseConfig = {
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
  configPath: "/tmp/safa.config.json"
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

test("governor blocks category when release lock enabled", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "run_packet",
      category: "external_tool",
      riskLevel: "LOW",
      requiresApproval: false,
      allowWhenNetworkOff: true
    },
    {
      ...baseConfig,
      releaseLock: {
        enabled: true,
        blockedCategories: ["external_tool"]
      }
    },
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
  assert.match(decision.reason, /release lock/i);
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

test("governor requires approval for external tools", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "run_packet",
      category: "external_tool",
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
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /approval required/i);
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

test("governor denies when approval record is denied", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "send_http_request",
      category: "network",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: false
    },
    {
      ...baseConfig,
      network: {
        enabled: true,
        allowlist: [],
        allowlistDomains: ["example.com"],
        allowlistUrls: [],
        timeoutMs: 10000,
        maxBytes: 200000
      }
    },
    {
      actor: "tester",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "DECIDE",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true,
      approval: {
        id: "apr-1",
        action: "send_http_request",
        target: "https://example.com",
        actor: "owner",
        status: "DENIED",
        createdAt: new Date().toISOString(),
        reason: "Not allowed"
      }
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /Not allowed/i);
});

test("governor denies when approval is expired", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "send_http_request",
      category: "network",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: false
    },
    {
      ...baseConfig,
      network: {
        enabled: true,
        allowlist: [],
        allowlistDomains: ["example.com"],
        allowlistUrls: [],
        timeoutMs: 10000,
        maxBytes: 200000
      }
    },
    {
      actor: "tester",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "DECIDE",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true,
      approval: {
        id: "apr-2",
        action: "send_http_request",
        target: "https://example.com",
        actor: "owner",
        status: "APPROVED",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString()
      }
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /expired/i);
});

test("network plan-hash mode requires approval record", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "send_http_request",
      category: "network",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: false
    },
    {
      ...baseConfig,
      governance: {
        strictApprovalMode: false,
        networkApprovalMode: "plan_hash",
        maxNetworkPayloadBytes: 16384
      },
      network: {
        enabled: true,
        allowlist: [],
        allowlistDomains: ["example.com"],
        allowlistUrls: [],
        timeoutMs: 10000,
        maxBytes: 200000
      }
    },
    {
      actor: "tester",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "DECIDE",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true,
      planHash: "plan-1"
    },
    {
      id: "req-1",
      purpose: "test",
      method: "GET",
      url: "https://example.com",
      headers: {},
      bodySummary: "",
      bodyHash: "hash",
      riskLevel: "HIGH",
      requiresApproval: true
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /plan hash required|approval record/i);
});

test("network plan-hash mode allows matching approval", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "send_http_request",
      category: "network",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: false
    },
    {
      ...baseConfig,
      governance: {
        strictApprovalMode: false,
        networkApprovalMode: "plan_hash",
        maxNetworkPayloadBytes: 16384
      },
      network: {
        enabled: true,
        allowlist: [],
        allowlistDomains: ["example.com"],
        allowlistUrls: [],
        timeoutMs: 10000,
        maxBytes: 200000
      }
    },
    {
      actor: "tester",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "DECIDE",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true,
      planHash: "plan-2",
      approval: {
        id: "apr-3",
        action: "send_http_request",
        target: "https://example.com",
        actor: "owner",
        status: "APPROVED",
        createdAt: new Date().toISOString(),
        planHash: "plan-2"
      }
    },
    {
      id: "req-2",
      purpose: "test",
      method: "GET",
      url: "https://example.com",
      headers: {},
      bodySummary: "",
      bodyHash: "hash",
      riskLevel: "HIGH",
      requiresApproval: true
    }
  );
  assert.equal(decision.allowed, true);
});
