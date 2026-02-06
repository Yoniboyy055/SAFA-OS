export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { sendEmail } = require("../src/core/email/client");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { sendEmailSkill } = require("../src/skills/outbound/send_email");

function buildConfig(rootDir, overrides = {}) {
  return {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["smtp.gmail.com"],
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
      emailSubjectAllowlist: ["Hello", "Subject"],
      emailTemplateAllowlist: ["template-1"],
      callIntentAllowlist: ["sales", "support", "follow_up", "payment"],
      callTemplateAllowlist: []
    },
    rootDir,
    configPath: path.join(rootDir, "jarvis.config.json"),
    ...overrides
  };
}

function buildContext(rootDir, overrides = {}) {
  const config = buildConfig(rootDir, overrides);
  return {
    actor: "tester",
    approved: true,
    authority: AuthorityLevel.OWNER,
    commandMode: "CREATE",
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

test("deny real send when network is disabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-email-"));
  const context = buildContext(rootDir, {
    email: { enabled: true, dryRunDefault: false, from: "Test <test@example.com>", smtp: { host: "smtp.gmail.com", port: 587, secure: false } },
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["smtp.gmail.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  await assert.rejects(
    () =>
      sendEmail(
        {
          to: ["user@allow.com"],
          subject: "Hello",
          body: "Test",
          dryRun: false
        },
        context
      ),
    /Network disabled/
  );
});

test("allow dry-run when network is off (writes outbox)", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-email-"));
  const context = buildContext(rootDir, {
    email: { enabled: false, dryRunDefault: true, from: "Test <test@example.com>", smtp: { host: "smtp.gmail.com", port: 587, secure: false } },
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["smtp.gmail.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  const result = await sendEmail(
    {
      to: ["user@allow.com"],
      subject: "Hello",
      body: "Test",
      dryRun: true
    },
    context
  );
  assert.equal(result.mode, "DRY_RUN");
  assert.ok(result.outboxPath);
  assert.ok(fs.existsSync(result.outboxPath));
});

test("deny when recipient not allowlisted", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-email-"));
  const context = buildContext(rootDir, {
    email: {
      enabled: false,
      provider: "smtp",
      fromAllowlist: ["*@example.com"],
      toAllowlist: ["*@allow.com"],
      domainAllowlist: [],
      dryRunDefault: true,
      from: "Test <test@example.com>",
      smtp: { host: "smtp.gmail.com", port: 587, secure: false }
    }
  });
  await assert.rejects(
    () =>
      sendEmail(
        {
          to: ["user@blocked.com"],
          subject: "Hello",
          body: "Test",
          dryRun: true
        },
        context
      ),
    /not allowlisted/i
  );
});

test("deny when kill switch enabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-email-"));
  const context = buildContext(rootDir, {
    killSwitch: { enabled: true }
  });
  await assert.rejects(
    () =>
      sendEmail(
        {
          to: ["user@allow.com"],
          subject: "Hello",
          body: "Test",
          dryRun: true
        },
        context
      ),
    /kill switch/i
  );
});

test("real email send is blocked in Phase 3", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-email-"));
  const context = buildContext(rootDir, {
    email: {
      enabled: true,
      provider: "smtp",
      fromAllowlist: ["*@example.com"],
      toAllowlist: ["*@allow.com"],
      domainAllowlist: [],
      dryRunDefault: false,
      from: "Test <test@example.com>",
      smtp: { host: "smtp.gmail.com", port: 587, secure: false }
    },
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["smtp.gmail.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    }
  });
  await assert.rejects(
    () =>
      sendEmail(
        {
          to: ["user@allow.com"],
          subject: "Hello",
          body: "Test",
          dryRun: false
        },
        context
      ),
    /disabled in Phase 3/i
  );
});

test("audit does not log smtp pass or full body", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-email-"));
  process.env.SMTP_PASS = "supersecret";
  const context = buildContext(rootDir, {
    governance: { strictApprovalMode: false, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 }
  });
  await sendEmailSkill.handler(
    {
      to: "user@allow.com",
      subject: "Subject",
      body: "BODY_SHOULD_NOT_APPEAR",
      dryRun: true
    },
    {
      actor: context.actor,
      approved: true,
      authority: context.authority,
      commandMode: context.commandMode,
      config: context.config,
      audit: context.audit,
      governor: context.governor
    }
  );
  const log = fs.readFileSync(context.config.audit.logPath, "utf8");
  assert.ok(!log.includes("supersecret"));
  assert.ok(!log.includes("BODY_SHOULD_NOT_APPEAR"));
  delete process.env.SMTP_PASS;
});
