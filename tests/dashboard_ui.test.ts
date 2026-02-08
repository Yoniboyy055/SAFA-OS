export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("node:http");
const { loadConfig } = require("../src/core/config");
const { createDashboardServer } = require("../src/dashboard/server");

function writeConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
  const configPath = path.join(rootDir, "jarvis.config.json");
  fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  return loadConfig(configPath);
}

function request(
  pathname: string,
  port: number
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method: "GET" },
      (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => {
          data += String(chunk);
        });
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("error", reject);
    req.end();
  });
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

test("dashboard UI returns HTML", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-ui-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const response = await request("/", port);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes("JARVIS"));
    assert.ok(response.body.includes("JARVIS"));
    assert.ok(response.body.includes("Conversation"));
  });
});
