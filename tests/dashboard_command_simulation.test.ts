export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadConfig } = require("../src/core/config");
const { createDashboardServer } = require("../src/dashboard/server");

function writeConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
  const configPath = path.join(rootDir, "jarvis.config.json");
  fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  return loadConfig(configPath);
}

async function api(port: number, pathName: string, body?: Record<string, unknown>) {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return { statusCode: res.status, body: await res.json() };
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

test("dashboard run read_file succeeds", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cmd-"));
  const config = writeConfig(rootDir, {
    killSwitch: { enabled: true },
    governance: { strictApprovalMode: false },
    permissions: { readAllowlist: ["."] }
  });
  fs.writeFileSync(path.join(rootDir, "sample.txt"), "hello");
  await withServer(config, async (port) => {
    const response = await api(port, "/api/run", {
      skill: "read_file",
      input: { path: "sample.txt" },
      approve: true,
      actor: "tester"
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "OK");
    assert.equal(response.body.output.content, "hello");
  });
});

test("dashboard denies network command when network OFF", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cmd-"));
  const config = writeConfig(rootDir, {
    killSwitch: { enabled: false },
    governance: { strictApprovalMode: false }
  });
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

test("dashboard requires approval for high-risk skills", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cmd-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: false } });
  await withServer(config, async (port) => {
    const response = await api(port, "/api/run", {
      skill: "send_http_request",
      input: { method: "GET", url: "https://example.com" },
      approve: false,
      actor: "tester"
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.body.status, "PENDING_APPROVAL");
  });
});
