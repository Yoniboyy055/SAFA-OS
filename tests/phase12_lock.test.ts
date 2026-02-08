export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { connectLiveModel, startAutoRoute } = require("../src/core/phase12/locked");

function buildContext(rootDir: string, overrides: Record<string, unknown> = {}) {
  const config = {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["api.openai.com"],
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
    execution: {
      enabled: false,
      allowCommands: [],
      maxRuntimeMs: 600000,
      allowlistPaths: []
    },
    audit: { logPath: path.join(rootDir, "audit.log"), redactKeys: [] },
    permissions: {
      writeAllowlist: [path.join(rootDir, "data")],
      readAllowlist: [path.join(rootDir, "data")],
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
    configPath: path.join(rootDir, "safa.config.json"),
    ...overrides
  };
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

test("phase 12 live adapters require network enable", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-llm-"));
  const context = buildContext(rootDir);
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    await assert.rejects(
      () =>
        connectLiveModel(
          {
            providerId: "openai",
            modelId: "gpt-4o-mini",
            messages: [{ role: "user", content: "Hello" }]
          },
          context
        ),
      /network.*disabled/i
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});

test("phase 12 auto route respects network gates", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-llm-"));
  const context = buildContext(rootDir);
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    await assert.rejects(
      () =>
        startAutoRoute(
          {
            commandText: "Summarize the roadmap",
            messages: [{ role: "user", content: "Summarize the roadmap" }],
            budget: "low",
            risk: "safe"
          },
          context
        ),
      /network.*disabled/i
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});
