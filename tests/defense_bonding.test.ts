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

test("bonding language is refused and audited", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-gate-g-"));
  fs.mkdirSync(path.join(rootDir, "data"), { recursive: true });
  const config = buildConfig(rootDir);
  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  const governor = new Governor();
  const registry = buildRegistry();

  const result = await executeWithContext(
    registry,
    "list_files",
    { path: "data", note: "you are my best friend" },
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

  assert.equal(result.success, false);
  assert.match(result.error, /refused/i);

  const logPath = config.audit.logPath;
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
  const hasDefense = lines.some((line: string) => {
    const entry = JSON.parse(line);
    return entry.action === "DEFENSE_DETECTION";
  });
  assert.ok(hasDefense);
});
