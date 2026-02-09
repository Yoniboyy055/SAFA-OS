export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { TriggerService } = require("../../daemon/trigger_service");
const { AuditLogger } = require("../../core/audit");
const { Governor } = require("../../core/governor");

function buildTestConfig(rootDir: string, overrides: any = {}) {
  return {
    configPath: path.join(rootDir, "safa.config.json"),
    rootDir,
    network: { enabled: false, allowlist: [], allowlistDomains: [], allowlistUrls: [], timeoutMs: 10000, maxBytes: 200000 },
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
      callIntentAllowlist: ["sales", "support", "follow_up", "payment"],
      callTemplateAllowlist: []
    },
    ...overrides
  };
}

function buildAudit(rootDir: string) {
  return new AuditLogger({ logPath: path.join(rootDir, "audit.log"), redactKeys: [] });
}

test("TriggerService starts with proactivity disabled", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-trigger-"));
  const config = buildTestConfig(rootDir, {
    proactivity: { enabled: false }
  });
  const audit = buildAudit(rootDir);
  const governor = new Governor();

  const service = new TriggerService(config, audit, governor, "test-actor");
  service.start();

  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("Proactivity disabled"));
  
  service.stop();
});

test("TriggerService starts with no triggers configured", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-trigger-"));
  const config = buildTestConfig(rootDir, {
    proactivity: { enabled: true, triggers: [] }
  });
  const audit = buildAudit(rootDir);
  const governor = new Governor();

  const service = new TriggerService(config, audit, governor, "test-actor");
  service.start();

  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("Starting trigger service with 0 trigger(s)"));
  
  service.stop();
});

test("TriggerService schedules valid cron trigger", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-trigger-"));
  const config = buildTestConfig(rootDir, {
    proactivity: {
      enabled: true,
      triggers: [
        {
          id: "test-trigger",
          type: "time",
          schedule: "* * * * *",
          action: {
            task: "Test task",
            mode: "SCRIPT",
            authority: "OWNER"
          },
          autoApprove: true
        }
      ]
    }
  });
  const audit = buildAudit(rootDir);
  const governor = new Governor();

  const service = new TriggerService(config, audit, governor, "test-actor");
  service.start();

  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("trigger_service.scheduled"));
  assert.ok(log.includes("test-trigger"));

  const tasks = service.getScheduledTasks();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "test-trigger");
  assert.equal(tasks[0].type, "time");
  assert.equal(tasks[0].schedule, "* * * * *");
  
  service.stop();
});

test("TriggerService rejects invalid cron expression", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-trigger-"));
  const config = buildTestConfig(rootDir, {
    proactivity: {
      enabled: true,
      triggers: [
        {
          id: "invalid-trigger",
          type: "time",
          schedule: "invalid cron",
          action: {
            task: "Test task",
            mode: "SCRIPT",
            authority: "OWNER"
          }
        }
      ]
    }
  });
  const audit = buildAudit(rootDir);
  const governor = new Governor();

  const service = new TriggerService(config, audit, governor, "test-actor");
  service.start();

  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("trigger_service.schedule_error"));
  assert.ok(log.includes("Invalid cron expression"));
  
  service.stop();
});

test("TriggerService registers event triggers", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-trigger-"));
  const config = buildTestConfig(rootDir, {
    proactivity: {
      enabled: true,
      triggers: [
        {
          id: "event-trigger",
          type: "event",
          action: {
            task: "Handle event",
            mode: "SCRIPT",
            authority: "OWNER"
          }
        }
      ]
    }
  });
  const audit = buildAudit(rootDir);
  const governor = new Governor();

  const service = new TriggerService(config, audit, governor, "test-actor");
  service.start();

  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("trigger_service.registered"));
  assert.ok(log.includes("event trigger"));
  
  service.stop();
});

test("TriggerService verifies template signatures", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-trigger-"));
  const config = buildTestConfig(rootDir, {
    proactivity: {
      enabled: true,
      triggers: [
        {
          id: "template-trigger",
          type: "time",
          schedule: "0 9 * * *",
          action: {
            task: "Read local files",
            mode: "SCRIPT",
            authority: "OWNER"
          },
          autoApprove: false
        }
      ],
      templates: [
        {
          templateId: "safe-local-read",
          allowedSkills: ["list_files", "read_file"],
          maxRisk: "LOW",
          autoApprove: true,
          cryptoSignature: "owner-signed-abc123"
        }
      ]
    }
  });
  const audit = buildAudit(rootDir);
  const governor = new Governor();

  const service = new TriggerService(config, audit, governor, "test-actor");
  service.start();

  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("trigger_service.scheduled"));
  
  service.stop();
});

test("TriggerService stops all scheduled tasks", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-trigger-"));
  const config = buildTestConfig(rootDir, {
    proactivity: {
      enabled: true,
      triggers: [
        {
          id: "trigger-1",
          type: "time",
          schedule: "* * * * *",
          action: {
            task: "Task 1",
            mode: "SCRIPT",
            authority: "OWNER"
          }
        },
        {
          id: "trigger-2",
          type: "time",
          schedule: "0 * * * *",
          action: {
            task: "Task 2",
            mode: "SCRIPT",
            authority: "OWNER"
          }
        }
      ]
    }
  });
  const audit = buildAudit(rootDir);
  const governor = new Governor();

  const service = new TriggerService(config, audit, governor, "test-actor");
  service.start();

  let tasks = service.getScheduledTasks();
  assert.equal(tasks.length, 2);

  service.stop();

  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("trigger_service.stop"));
  assert.ok(log.includes("Stopping 2 scheduled task(s)"));
});

test("TriggerService getScheduledTasks returns task details", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-trigger-"));
  const config = buildTestConfig(rootDir, {
    proactivity: {
      enabled: true,
      triggers: [
        {
          id: "daily-reminder",
          type: "time",
          schedule: "0 9 * * 1-5",
          action: {
            task: "Send daily reminder",
            mode: "SCRIPT",
            authority: "OWNER"
          },
          autoApprove: true
        }
      ]
    }
  });
  const audit = buildAudit(rootDir);
  const governor = new Governor();

  const service = new TriggerService(config, audit, governor, "test-actor");
  service.start();

  const tasks = service.getScheduledTasks();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "daily-reminder");
  assert.equal(tasks[0].type, "time");
  assert.equal(tasks[0].schedule, "0 9 * * 1-5");
  assert.equal(tasks[0].action, "Send daily reminder");
  assert.equal(tasks[0].autoApprove, true);
  assert.ok(tasks[0].nextRun instanceof Date);
  
  service.stop();
});
