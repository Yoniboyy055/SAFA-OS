export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { sendEmailSkill } = require("../src/skills/outbound/send_email");

function buildContext(rootDir, overrides = {}) {
  const config = {
    network: { enabled: false, allowlist: [], allowlistDomains: ["smtp.gmail.com"], allowlistUrls: [] },
    telemetry: { enabled: false },
    killSwitch: { enabled: false },
    governance: { strictApprovalMode: false, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 },
    email: { enabled: false, dryRunDefault: true, from: "Test <test@example.com>", smtp: { host: "smtp.gmail.com", port: 587, secure: false } },
    audit: { logPath: path.join(rootDir, "audit.log"), redactKeys: [] },
    permissions: { writeAllowlist: [], readAllowlist: [], emailRecipientAllowlist: ["*@allow.com"], emailRecipientDenylist: [] },
    rootDir,
    configPath: path.join(rootDir, "jarvis.config.json"),
    ...overrides
  };
  return {
    actor: "tester",
    approved: true,
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

test("email queue dry-run writes outbox file", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-email-"));
  const context = buildContext(rootDir);
  const result = await sendEmailSkill.handler(
    {
      to: "user@allow.com",
      subject: "Queued",
      text: "Draft body",
      dryRun: true
    },
    context
  );
  assert.equal(result.mode, "DRY_RUN");
  assert.ok(result.outboxPath);
  assert.ok(fs.existsSync(result.outboxPath));
});
