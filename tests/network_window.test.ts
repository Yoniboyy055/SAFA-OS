export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("node:http");
const { Governor } = require("../src/core/governor");
const { AuditLogger } = require("../src/core/audit");
const { AuthorityLevel } = require("../src/core/authority");
const {
  openNetworkWindow,
  closeNetworkWindow,
  loadNetworkWindow,
  isNetworkWindowActive,
  saveNetworkWindow
} = require("../src/core/network_window");
const { loadConfig } = require("../src/core/config");
const { createDashboardServer } = require("../src/dashboard/server");

const baseConfig = {
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
  execution: {
    enabled: false,
    allowCommands: [],
    maxRuntimeMs: 600000,
    allowlistPaths: []
  },
  audit: { logPath: "/tmp/audit.log", redactKeys: [] },
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
  rootDir: "/tmp",
  configPath: "/tmp/jarvis.config.json"
};

// --- NetworkWindow unit tests ---

test("openNetworkWindow creates valid state", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-nw-"));
  const state = openNetworkWindow(rootDir, 6, "owner");
  assert.equal(state.enabled, true);
  assert.ok(state.startAt);
  assert.ok(state.endAt);
  assert.equal(state.openedBy, "owner");
  const start = Date.parse(state.startAt);
  const end = Date.parse(state.endAt);
  const diff = (end - start) / (1000 * 60 * 60);
  assert.equal(diff, 6);
});

test("closeNetworkWindow disables the window", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-nw-"));
  openNetworkWindow(rootDir, 8, "owner");
  const state = closeNetworkWindow(rootDir, "owner");
  assert.equal(state.enabled, false);
});

test("loadNetworkWindow returns empty state when file does not exist", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-nw-"));
  const state = loadNetworkWindow(rootDir);
  assert.equal(state.enabled, false);
});

test("loadNetworkWindow persists across reload", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-nw-"));
  openNetworkWindow(rootDir, 6, "owner");
  const loaded = loadNetworkWindow(rootDir);
  assert.equal(loaded.enabled, true);
  assert.ok(loaded.startAt);
  assert.ok(loaded.endAt);
});

test("isNetworkWindowActive returns true within window", () => {
  const now = new Date();
  const state = {
    enabled: true,
    startAt: new Date(now.getTime() - 1000).toISOString(),
    endAt: new Date(now.getTime() + 60000).toISOString(),
    openedBy: "owner",
    openedAt: now.toISOString()
  };
  assert.equal(isNetworkWindowActive(state, now), true);
});

test("isNetworkWindowActive returns false when window expired", () => {
  const now = new Date();
  const state = {
    enabled: true,
    startAt: new Date(now.getTime() - 120000).toISOString(),
    endAt: new Date(now.getTime() - 60000).toISOString(),
    openedBy: "owner",
    openedAt: new Date(now.getTime() - 120000).toISOString()
  };
  assert.equal(isNetworkWindowActive(state, now), false);
});

test("isNetworkWindowActive returns false when disabled", () => {
  const now = new Date();
  const state = {
    enabled: false,
    startAt: new Date(now.getTime() - 1000).toISOString(),
    endAt: new Date(now.getTime() + 60000).toISOString(),
    openedBy: "owner",
    openedAt: now.toISOString()
  };
  assert.equal(isNetworkWindowActive(state, now), false);
});

// --- Governor: local real-run allowed ---

test("governor allows local real-run (category=local, low risk)", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "read_file",
      category: "local",
      riskLevel: "LOW",
      requiresApproval: false,
      allowWhenNetworkOff: true
    },
    baseConfig,
    {
      actor: "tester",
      approved: false,
      authority: AuthorityLevel.OWNER,
      commandMode: "SCRIPT",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true
    }
  );
  assert.equal(decision.allowed, true);
});

// --- Governor: network denied when window closed ---

test("governor denies network when window is closed", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const now = new Date();
  const decision = governor.evaluate(
    {
      type: "send_http_request",
      category: "network",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: false
    },
    {
      ...baseConfig,
      network: {
        enabled: true,
        allowlist: [],
        allowlistDomains: ["example.com"],
        allowlistUrls: [],
        timeoutMs: 10000,
        maxBytes: 200000
      }
    },
    {
      actor: "tester",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "SCRIPT",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true,
      networkWindow: {
        enabled: false,
        startAt: "",
        endAt: "",
        openedBy: "",
        openedAt: ""
      }
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /window.*closed|expired/i);
});

// --- Governor: network allowed within window ---

test("governor allows network when window is active", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const now = new Date();
  const decision = governor.evaluate(
    {
      type: "send_http_request",
      category: "network",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: false
    },
    {
      ...baseConfig,
      network: {
        enabled: true,
        allowlist: [],
        allowlistDomains: ["example.com"],
        allowlistUrls: [],
        timeoutMs: 10000,
        maxBytes: 200000
      }
    },
    {
      actor: "tester",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "SCRIPT",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true,
      networkWindow: {
        enabled: true,
        startAt: new Date(now.getTime() - 1000).toISOString(),
        endAt: new Date(now.getTime() + 3600000).toISOString(),
        openedBy: "owner",
        openedAt: now.toISOString()
      }
    },
    {
      id: "net-test",
      purpose: "test",
      method: "GET",
      url: "https://example.com/api",
      headers: {},
      bodySummary: "",
      bodyHash: "",
      riskLevel: "HIGH",
      requiresApproval: true
    }
  );
  assert.equal(decision.allowed, true);
});

// --- Governor: window expiry blocks network ---

test("governor denies network when window has expired", () => {
  const audit = new AuditLogger({ logPath: "/tmp/audit.log", redactKeys: [] });
  const governor = new Governor();
  const now = new Date();
  const decision = governor.evaluate(
    {
      type: "send_http_request",
      category: "network",
      riskLevel: "HIGH",
      requiresApproval: true,
      allowWhenNetworkOff: false
    },
    {
      ...baseConfig,
      network: {
        enabled: true,
        allowlist: [],
        allowlistDomains: ["example.com"],
        allowlistUrls: [],
        timeoutMs: 10000,
        maxBytes: 200000
      }
    },
    {
      actor: "tester",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "SCRIPT",
      audit,
      maturityLevel: 5,
      freshOwnerInput: true,
      networkWindow: {
        enabled: true,
        startAt: new Date(now.getTime() - 7200000).toISOString(),
        endAt: new Date(now.getTime() - 3600000).toISOString(),
        openedBy: "owner",
        openedAt: new Date(now.getTime() - 7200000).toISOString()
      }
    }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /window.*closed|expired/i);
});

// --- Dashboard: refuses non-local execution ---

function writeConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
  const configPath = path.join(rootDir, "jarvis.config.json");
  fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  return loadConfig(configPath);
}

async function readJson(res: any) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    return {};
  }
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      chunks.push(value);
    }
    if (done) {
      break;
    }
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function api(port: number, pathName: string, body?: Record<string, unknown>) {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { statusCode: res.status, body: await readJson(res) };
}

async function withServer(
  config: ReturnType<typeof writeConfig>,
  handler: (port: number) => Promise<void>
) {
  const server = createDashboardServer({ configPath: config.configPath });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" ? address.port : 0;
  try {
    await handler(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("dashboard allows local run when strict approval is off", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-nw-dash-"));
  fs.writeFileSync(path.join(rootDir, "test.txt"), "hello world");
  const config = writeConfig(rootDir, {
    killSwitch: { enabled: false },
    governance: { strictApprovalMode: false },
    permissions: {
      readAllowlist: [rootDir],
      writeAllowlist: [rootDir]
    }
  });
  await withServer(config, async (port) => {
    const response = await api(port, "/api/run", {
      skill: "read_file",
      input: { path: "test.txt" },
      approve: true,
      actor: "tester"
    });
    assert.equal(response.body.status, "OK");
  });
});

test("dashboard denies network run when network is off", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-nw-dash-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: false } });
  await withServer(config, async (port) => {
    const pending = await api(port, "/api/run", {
      skill: "send_http_request",
      input: { method: "GET", url: "https://example.com" },
      approve: false,
      actor: "tester"
    });
    const approved = await api(port, "/api/approve", {
      approvalId: pending.body.approvalId,
      decision: "APPROVE",
      actor: "tester"
    });
    assert.equal(approved.body.status, "APPROVED");
    const response = await api(port, "/api/run", {
      skill: "send_http_request",
      input: { method: "GET", url: "https://example.com" },
      approve: true,
      approvalId: pending.body.approvalId,
      actor: "tester"
    });
    assert.equal(response.statusCode, 403);
    assert.match(response.body.error, /network is disabled/i);
  });
});

test("dashboard returns pending approval in strict mode", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-nw-dash-"));
  const config = writeConfig(rootDir, {
    killSwitch: { enabled: true },
    governance: { strictApprovalMode: true }
  });
  await withServer(config, async (port) => {
    const response = await api(port, "/api/run", {
      skill: "read_file",
      input: { path: "README.md" },
      approve: false,
      actor: "tester"
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.body.status, "PENDING_APPROVAL");
  });
});
