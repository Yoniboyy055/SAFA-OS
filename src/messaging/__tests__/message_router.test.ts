export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { MessageRouter } = require("../../messaging/message_router");
const { AuditLogger } = require("../../core/audit");

function buildTestConfig(rootDir: string) {
  return {
    configPath: path.join(rootDir, "safa.config.json"),
    rootDir,
    network: { enabled: true, allowlist: [], allowlistDomains: [], allowlistUrls: [], timeoutMs: 10000, maxBytes: 200000 },
    telemetry: { enabled: false },
    killSwitch: { enabled: true },
    governance: { strictApprovalMode: true, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 },
    phase: { current: 17 },
    releaseLock: { enabled: false, blockedCategories: [] },
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
    execution: { enabled: false, allowCommands: [], maxRuntimeMs: 600000, allowlistPaths: [] },
    audit: { logPath: path.join(rootDir, "audit.log"), redactKeys: [] },
    permissions: {
      writeAllowlist: ["workspace", "data"],
      readAllowlist: ["data", "workspace", "docs"],
      stripePriceAllowlist: [],
      stripeAmountAllowlist: [],
      stripeCurrencyAllowlist: ["usd"],
      stripeCustomerEmailAllowlist: [],
      emailSubjectAllowlist: [],
      emailTemplateAllowlist: [],
      callIntentAllowlist: [],
      callTemplateAllowlist: []
    },
    messaging: {
      discord: {
        enabled: true,
        botToken: "test-token",
        channelAllowlist: ["discord-channel"],
        guildAllowlist: [],
        dryRunDefault: true
      },
      slack: {
        enabled: true,
        botToken: "test-token",
        channelAllowlist: ["slack-channel"],
        workspaceAllowlist: [],
        dryRunDefault: true
      },
      whatsapp: {
        enabled: true,
        provider: "twilio",
        accountSid: "test-sid",
        authToken: "test-token",
        fromNumberAllowlist: ["+1234567890"],
        toNumberAllowlist: ["+0987654321"],
        dryRunDefault: true
      }
    }
  };
}

function buildAudit(rootDir: string) {
  return new AuditLogger({ logPath: path.join(rootDir, "audit.log"), redactKeys: [] });
}

test("MessageRouter routes Discord message", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-router-"));
  const config = buildTestConfig(rootDir);
  const audit = buildAudit(rootDir);
  const router = new MessageRouter(config, audit);

  const result = await router.sendMessage({
    platform: "discord",
    to: "discord-channel",
    content: "Test message"
  });

  assert.equal(result.success, true);
  assert.ok(result.messageId?.startsWith("dry-run-"));
  
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("message_router.send"));
  assert.ok(log.includes("discord:discord-channel"));
});

test("MessageRouter routes Slack message", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-router-"));
  const config = buildTestConfig(rootDir);
  const audit = buildAudit(rootDir);
  const router = new MessageRouter(config, audit);

  const result = await router.sendMessage({
    platform: "slack",
    to: "slack-channel",
    content: "Test message"
  });

  assert.equal(result.success, true);
  assert.ok(result.messageId?.startsWith("dry-run-"));
  
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("slack:slack-channel"));
});

test("MessageRouter routes WhatsApp message", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-router-"));
  const config = buildTestConfig(rootDir);
  const audit = buildAudit(rootDir);
  const router = new MessageRouter(config, audit);

  const result = await router.sendMessage({
    platform: "whatsapp",
    to: "+0987654321",
    content: "Test message"
  });

  assert.equal(result.success, true);
  assert.ok(result.messageId?.startsWith("dry-run-"));
  
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("whatsapp:+0987654321"));
});

test("MessageRouter rejects unknown platform", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-router-"));
  const config = buildTestConfig(rootDir);
  const audit = buildAudit(rootDir);
  const router = new MessageRouter(config, audit);

  const result = await router.sendMessage({
    platform: "unknown" as any,
    to: "test",
    content: "Test message"
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes("Unknown platform"));
  
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("message_router.error"));
});

test("MessageRouter getAdapter returns correct adapter", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-router-"));
  const config = buildTestConfig(rootDir);
  const audit = buildAudit(rootDir);
  const router = new MessageRouter(config, audit);

  const discordAdapter = router.getAdapter("discord");
  assert.equal(discordAdapter.platform, "discord");

  const slackAdapter = router.getAdapter("slack");
  assert.equal(slackAdapter.platform, "slack");

  const whatsappAdapter = router.getAdapter("whatsapp");
  assert.equal(whatsappAdapter.platform, "whatsapp");
});
