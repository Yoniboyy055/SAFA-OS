export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { SkillRegistry } = require("../src/skills/registry");
const { listFilesSkill } = require("../src/skills/local/list_files");
const { writeFileSkill } = require("../src/skills/local/write_file");
const { withTestCommandContext } = require("./helpers/command_context");

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
    killSwitch: { enabled: false },
    governance: {
      strictApprovalMode: false,
      networkApprovalMode: "per_request",
      maxNetworkPayloadBytes: 16384
    },
    audit: { logPath: path.join(rootDir, "logs", "audit.log"), redactKeys: [] },
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
    configPath: path.join(rootDir, "safa.config.json")
  };
}

function buildRegistry() {
  const registry = new SkillRegistry();
  registry.register(listFilesSkill);
  registry.register(writeFileSkill);
  return registry;
}

function executeWithContext(
  registry: typeof SkillRegistry.prototype,
  name: string,
  input: Record<string, unknown>,
  context: Record<string, unknown>
) {
  const actor = typeof context.actor === "string" ? context.actor : "tester";
  return withTestCommandContext(actor, () => registry.execute(name, input, context));
}

function readAudit(logPath: string) {
  return fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line: string) => JSON.parse(line));
}

function assertAuditSchema(entry: any) {
  assert.ok(typeof entry.timestamp === "string");
  assert.ok(typeof entry.actor === "string");
  assert.ok(typeof entry.action === "string");
  assert.ok(typeof entry.target === "string");
  assert.ok(typeof entry.result === "string");
  assert.equal(typeof entry.approved, "boolean");
}

test("audit logs blocked and executed actions", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-audit-gate-e-"));
  const config = buildConfig(rootDir);
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  const governor = new Governor();
  const registry = buildRegistry();

  const denied = await executeWithContext(
    registry,
    "write_file",
    { path: "data/out.txt", content: "hello" },
    {
      actor: "tester",
      approved: false,
      authority: AuthorityLevel.OWNER,
      commandMode: "SCRIPT",
      config,
      audit,
      governor
    }
  );
  assert.equal(denied.success, false);

  const allowed = await executeWithContext(
    registry,
    "list_files",
    { path: "data" },
    {
      actor: "tester",
      approved: false,
      authority: AuthorityLevel.OWNER,
      commandMode: "SCRIPT",
      config,
      audit,
      governor
    }
  );
  assert.equal(allowed.success, true);

  const entries = readAudit(config.audit.logPath);
  const deniedEntry = entries.find((entry: any) =>
    entry.action === "write_file" && String(entry.result).startsWith("DENIED")
  );
  const successEntry = entries.find((entry: any) =>
    entry.action === "list_files" && entry.result === "SUCCESS"
  );
  assert.ok(deniedEntry);
  assert.ok(successEntry);
  assertAuditSchema(deniedEntry);
  assertAuditSchema(successEntry);
});
