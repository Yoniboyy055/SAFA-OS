export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const { requestNetwork } = require("../src/core/network/request");

const originalFetch = globalThis.fetch;

function buildContext(rootDir, overrides = {}) {
  const config = {
    network: { enabled: true, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] },
    telemetry: { enabled: false },
    killSwitch: { enabled: false },
    governance: { strictApprovalMode: false, networkApprovalMode: "per_request", maxNetworkPayloadBytes: 16384 },
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
    audit: { logPath: path.join(rootDir, "audit.log"), redactKeys: [] },
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
    configPath: path.join(rootDir, "jarvis.config.json"),
    ...overrides
  };
  return {
    actor: "tester",
    approved: true,
    authority: AuthorityLevel.OWNER,
    commandMode: "DECIDE",
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

test("deny when network OFF", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir, { network: { enabled: false, allowlist: [], allowlistDomains: ["example.com"], allowlistUrls: [] } });
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  await assert.rejects(
    () =>
      requestNetwork(
        { method: "GET", url: "https://example.com", purpose: "test" },
        context
      ),
    /Network disabled/
  );
  globalThis.fetch = originalFetch;
});

test("deny when domain not allowlisted", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir, { network: { enabled: true, allowlist: [], allowlistDomains: ["allowed.com"], allowlistUrls: [] } });
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  await assert.rejects(
    () =>
      requestNetwork(
        { method: "GET", url: "https://example.com", purpose: "test" },
        context
      ),
    /not allowlisted/i
  );
  globalThis.fetch = originalFetch;
});

test("payload size enforcement", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  const bigBody = "a".repeat(20000);
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  await assert.rejects(
    () =>
      requestNetwork(
        {
          method: "POST",
          url: "https://example.com",
          purpose: "test",
          body: bigBody
        },
        context
      ),
    /Payload exceeds max/i
  );
  globalThis.fetch = originalFetch;
});

test("method allowlist enforces GET/POST", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  await assert.rejects(
    () =>
      requestNetwork(
        { method: "PUT", url: "https://example.com", purpose: "test" },
        context
      ),
    /Method not allowlisted/i
  );
  globalThis.fetch = originalFetch;
});

test("allowlisted request executes with approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-net-"));
  const context = buildContext(rootDir);
  globalThis.fetch = async () => ({
    status: 200,
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) {
              return { done: true };
            }
            sent = true;
            return { done: false, value: new TextEncoder().encode("ok") };
          },
          cancel() {
            return Promise.resolve();
          }
        };
      }
    }
  });
  const result = await requestNetwork(
    { method: "GET", url: "https://example.com", purpose: "test" },
    context
  );
  assert.equal(result.status, 200);
  assert.ok(result.responseHash);
  globalThis.fetch = originalFetch;
});

