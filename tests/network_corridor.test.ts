export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Governor } = require("../src/core/governor");
const { AuditLogger, auditNetworkRequest } = require("../src/core/audit");
const { requestNetwork } = require("../src/core/network/client");
const { validateUrl } = require("../src/core/network/types");

function buildConfig(rootDir, overrides = {}) {
  return {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: ["example.com"],
      allowlistUrls: []
    },
    telemetry: { enabled: false },
    killSwitch: { enabled: false },
    governance: {
      strictApprovalMode: false,
      networkApprovalMode: "per_request",
      maxNetworkPayloadBytes: 16384
    },
    audit: { logPath: path.join(rootDir, "audit.log"), redactKeys: [] },
    permissions: { writeAllowlist: [], readAllowlist: [] },
    rootDir,
    configPath: path.join(rootDir, "jarvis.config.json"),
    ...overrides
  };
}

function buildRequest(url = "https://example.com") {
  return {
    id: "req-1",
    purpose: "test",
    method: "GET",
    url,
    headers: {},
    bodySummary: "",
    bodyHash: "hash",
    riskLevel: "LOW",
    requiresApproval: false
  };
}

test("network disabled: governor denies and client throws", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, { network: { ...buildConfig(rootDir).network, enabled: false } });
  const governor = new Governor();
  const decision = governor.evaluateNetwork(
    buildRequest(),
    config,
    { actor: "tester", approved: true }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /disabled/i);

  const audit = new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] });
  await assert.rejects(
    () =>
      requestNetwork(buildRequest(), {
        actor: "tester",
        approved: true,
        config,
        audit,
        governor
      }),
    /Network disabled/
  );
});

test("network enabled but allowlistDomains empty => deny", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: { enabled: true, allowlist: [], allowlistDomains: [], allowlistUrls: [] }
  });
  const governor = new Governor();
  const decision = governor.evaluateNetwork(
    buildRequest(),
    config,
    { actor: "tester", approved: true }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /allowlisted domains/i);
});

test("strict approval mode denies when not approved", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const config = buildConfig(rootDir, {
    network: { enabled: true, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] },
    governance: { strictApprovalMode: true, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 }
  });
  const governor = new Governor();
  const decision = governor.evaluateNetwork(
    buildRequest(),
    config,
    { actor: "tester", approved: false }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /strict approval/i);
});

test("validator denies non-https URL", () => {
  const decision = validateUrl("http://example.com", {
    allowlistDomains: ["example.com"],
    allowlistUrls: [],
    allowHttp: false,
    maxPayloadBytes: 16384
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /https/i);
});

test("audit redaction prevents authorization/cookie leakage", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const logPath = path.join(rootDir, "audit.log");
  const logger = new AuditLogger({ logPath, redactKeys: [] });

  auditNetworkRequest(
    logger,
    {
      url: "https://example.com",
      domain: "example.com",
      method: "GET",
      purpose: "test",
      approved: true,
      bodyHash: "hash",
      bodySummary: "",
      headers: {
        Authorization: "Bearer SECRET",
        cookie: "session=abc",
        "set-cookie": "token=xyz"
      }
    },
    "tester"
  );

  const line = fs.readFileSync(logPath, "utf8").trim();
  assert.ok(!line.includes("Bearer SECRET"));
  assert.ok(!line.includes("session=abc"));
  assert.ok(!line.includes("token=xyz"));
});
