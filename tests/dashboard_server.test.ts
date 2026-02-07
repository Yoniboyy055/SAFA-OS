export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startDashboardServer } = require("../src/dashboard/server");

function writeConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
  const configPath = path.join(rootDir, "jarvis.config.json");
  fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  return configPath;
}

test("dashboard can start with kill switch enabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: true } });
  const server = await startDashboardServer({ configPath, port: 0 });
  const address = server.address();
  if (address && typeof address === "object") {
    assert.equal(address.address, "127.0.0.1");
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
