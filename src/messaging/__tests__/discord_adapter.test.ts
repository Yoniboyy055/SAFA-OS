export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { DiscordAdapter } = require("../../messaging/discord_adapter");
const { AuditLogger } = require("../../core/audit");

function buildTestConfig(rootDir: string, overrides: any = {}) {
  return {
    configPath: path.join(rootDir, "safa.config.json"),
    rootDir,
    network: { enabled: true, allowlist: [], allowlistDomains: ["discord.com"], allowlistUrls: [], timeoutMs: 10000, maxBytes: 200000 },
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
    ...overrides
  };
}

function buildAudit(rootDir: string) {
  return new AuditLogger({ logPath: path.join(rootDir, "audit.log"), redactKeys: [] });
}

test("DiscordAdapter rejects when disabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-discord-"));
  const config = buildTestConfig(rootDir, {
    messaging: {
      discord: {
        enabled: false,
        botToken: "test-token",
        channelAllowlist: ["123"],
        guildAllowlist: [],
        dryRunDefault: true
      }
    }
  });
  const audit = buildAudit(rootDir);
  const adapter = new DiscordAdapter(config, audit);

  const result = await adapter.sendMessage({
    platform: "discord",
    to: "123",
    content: "Test message"
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "Discord messaging is disabled");
  
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("discord.send.disabled"));
});

test("DiscordAdapter rejects channel not in allowlist", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-discord-"));
  const config = buildTestConfig(rootDir, {
    messaging: {
      discord: {
        enabled: true,
        botToken: "test-token",
        channelAllowlist: ["allowed-channel"],
        guildAllowlist: [],
        dryRunDefault: true
      }
    }
  });
  const audit = buildAudit(rootDir);
  const adapter = new DiscordAdapter(config, audit);

  const result = await adapter.sendMessage({
    platform: "discord",
    to: "not-allowed",
    content: "Test message"
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "Channel not in allowlist");
  
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("discord.send.denied"));
});

test("DiscordAdapter dry run mode works", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-discord-"));
  const config = buildTestConfig(rootDir, {
    messaging: {
      discord: {
        enabled: true,
        botToken: "test-token",
        channelAllowlist: ["test-channel"],
        guildAllowlist: [],
        dryRunDefault: true
      }
    }
  });
  const audit = buildAudit(rootDir);
  const adapter = new DiscordAdapter(config, audit);

  const result = await adapter.sendMessage({
    platform: "discord",
    to: "test-channel",
    content: "Test message"
  });

  assert.equal(result.success, true);
  assert.ok(result.messageId?.startsWith("dry-run-"));
  
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("discord.send.dry_run"));
  assert.ok(log.includes("Test message"));
});

test("DiscordAdapter allows wildcard in allowlist", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-discord-"));
  const config = buildTestConfig(rootDir, {
    messaging: {
      discord: {
        enabled: true,
        botToken: "test-token",
        channelAllowlist: ["*"],
        guildAllowlist: [],
        dryRunDefault: true
      }
    }
  });
  const audit = buildAudit(rootDir);
  const adapter = new DiscordAdapter(config, audit);

  const result = await adapter.sendMessage({
    platform: "discord",
    to: "any-channel",
    content: "Test message"
  });

  assert.equal(result.success, true);
});

test("DiscordAdapter parses incoming message", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-discord-"));
  const config = buildTestConfig(rootDir);
  const audit = buildAudit(rootDir);
  const adapter = new DiscordAdapter(config, audit);

  const webhookPayload = {
    id: "msg123",
    content: "Hello SAFA!",
    channel_id: "channel456",
    guild_id: "guild789",
    timestamp: "2026-02-09T12:00:00Z",
    author: {
      id: "user001",
      username: "testuser"
    }
  };

  const parsed = adapter.parseIncomingMessage(webhookPayload);

  assert.equal(parsed.platform, "discord");
  assert.equal(parsed.id, "msg123");
  assert.equal(parsed.content, "Hello SAFA!");
  assert.equal(parsed.to, "channel456");
  assert.equal(parsed.from, "user001");
  assert.equal(parsed.metadata?.authorName, "testuser");
  assert.equal(parsed.metadata?.guildId, "guild789");
});
