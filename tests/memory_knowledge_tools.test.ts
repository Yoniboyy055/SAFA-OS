export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { SkillRegistry } = require("../src/skills/registry");
const { logInteractionSkill } = require("../src/skills/memory/log_interaction");
const { writeSessionSummarySkill } = require("../src/skills/memory/write_session_summary");
const { promoteToCanonMemorySkill } = require("../src/skills/memory/promote_to_canon_memory");
const { queryCanonMemorySkill } = require("../src/skills/memory/query_canon_memory");
const { searchRawLogsSkill } = require("../src/skills/memory/search_raw_logs");
const { addKnowledgeDocSkill } = require("../src/skills/knowledge/add_knowledge_doc");
const { listToolsSkill } = require("../src/skills/tools/list_tools");
const { recommendToolSkill } = require("../src/skills/tools/recommend_tool");

function buildConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
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
    audit: { logPath: path.join(rootDir, "logs", "audit.log"), redactKeys: [] },
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
    rootDir,
    configPath: path.join(rootDir, "safa.config.json"),
    ...overrides
  };
}

function buildContext(rootDir: string, overrides: Record<string, unknown> = {}) {
  const config = buildConfig(rootDir, overrides);
  return {
    actor: "tester",
    approved: false,
    authority: AuthorityLevel.OWNER,
    commandMode: "SCRIPT",
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

function buildRegistry() {
  const registry = new SkillRegistry();
  registry.register(logInteractionSkill);
  registry.register(writeSessionSummarySkill);
  registry.register(promoteToCanonMemorySkill);
  registry.register(queryCanonMemorySkill);
  registry.register(searchRawLogsSkill);
  registry.register(addKnowledgeDocSkill);
  registry.register(listToolsSkill);
  registry.register(recommendToolSkill);
  return registry;
}

test("tier0 logs redact secrets and PII", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-memory-"));
  const registry = buildRegistry();
  const context = buildContext(rootDir);
  const result = await registry.execute(
    "log_interaction",
    { text: "Key sk-ABCDEF1234567890 email test@example.com" },
    context
  );
  assert.equal(result.success, true);
  const logDir = path.join(rootDir, "memory", "raw");
  const files = fs.readdirSync(logDir);
  assert.ok(files.length > 0);
  const line = fs.readFileSync(path.join(logDir, files[0]), "utf8").trim();
  assert.ok(line.includes("[REDACTED]"));
  assert.equal(line.includes("sk-"), false);
  assert.equal(line.includes("test@example.com"), false);

  const auditRaw = fs.readFileSync(path.join(rootDir, "logs", "audit.log"), "utf8");
  assert.equal(auditRaw.includes("sk-ABCDEF1234567890"), false);
});

test("tier1 summary requires approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-memory-"));
  const registry = buildRegistry();
  const context = buildContext(rootDir);
  const result = await registry.execute(
    "write_session_summary",
    { summary: "Summary text" },
    context
  );
  assert.equal(result.success, false);
  assert.match(result.error, /approval required/i);
});

test("tier2 canon requires approval and blocks secrets", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-memory-"));
  const registry = buildRegistry();
  const context = buildContext(rootDir);
  const denied = await registry.execute(
    "promote_to_canon_memory",
    { facts: "Canon facts" },
    context
  );
  assert.equal(denied.success, false);
  assert.match(denied.error, /approval required/i);

  const approvedContext = { ...context, approved: true };
  const blocked = await registry.execute(
    "promote_to_canon_memory",
    { facts: "Secret sk-ABCDEF1234567890" },
    approvedContext
  );
  assert.equal(blocked.success, false);
  assert.match(blocked.error, /secrets detected/i);
});

test("query_canon_memory does not touch raw logs", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-memory-"));
  const registry = buildRegistry();
  const context = buildContext(rootDir, { governance: { strictApprovalMode: false } });
  fs.mkdirSync(path.join(rootDir, "memory", "raw"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "memory", "canon"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "memory", "raw", "log.log"), "raw-only\n");
  fs.writeFileSync(
    path.join(rootDir, "memory", "canon", "canon.txt"),
    "canon-only\n"
  );

  const result = await registry.execute(
    "query_canon_memory",
    { query: "raw-only" },
    { ...context, approved: true }
  );
  assert.equal(result.success, true);
  assert.equal(result.output.matches.length, 0);
});

test("search_raw_logs requires approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-memory-"));
  const registry = buildRegistry();
  const context = buildContext(rootDir);
  const result = await registry.execute(
    "search_raw_logs",
    { query: "anything" },
    context
  );
  assert.equal(result.success, false);
  assert.match(result.error, /approval required/i);
});

test("add_knowledge_doc requires approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-knowledge-"));
  const registry = buildRegistry();
  const context = buildContext(rootDir);
  const result = await registry.execute(
    "add_knowledge_doc",
    { path: "policies/example.txt", content: "Secret sk-ABCDEF1234567890" },
    context
  );
  assert.equal(result.success, false);
  assert.match(result.error, /approval required/i);
});

test("tool recommendations require approval and return tradeoffs", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-tools-"));
  fs.mkdirSync(path.join(rootDir, "tools"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "tools", "tools.catalog.json"),
    JSON.stringify(
      {
        tools: [
          {
            name: "local_search",
            description: "Search local files",
            category: "local",
            risk: "LOW",
            requiresApproval: false,
            networkRequired: false,
            costNotes: "Free",
            privacyNotes: "Local only"
          }
        ]
      },
      null,
      2
    )
  );
  const registry = buildRegistry();
  const context = buildContext(rootDir);
  const denied = await registry.execute(
    "recommend_tool",
    { task: "Search local files" },
    context
  );
  assert.equal(denied.success, false);
  assert.match(denied.error, /approval required/i);

  const approved = await registry.execute(
    "recommend_tool",
    { task: "Search local files", budgetCapUsd: 0 },
    { ...context, approved: true }
  );
  assert.equal(approved.success, true);
  assert.ok(approved.output.recommendations[0].costNotes);
  assert.ok(approved.output.recommendations[0].privacyNotes);
});
