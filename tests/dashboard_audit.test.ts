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

test("dashboard run appends audit entry", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-audit-"));
  const config = writeConfig(rootDir, {
    killSwitch: { enabled: false },
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
  });

  const logPath = path.join(rootDir, "logs", "audit.log");
  const raw = fs.readFileSync(logPath, "utf8");
  assert.ok(raw.includes("dashboard.run"));
});
