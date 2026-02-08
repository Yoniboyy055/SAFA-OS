export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startDashboardServer } = require("../src/dashboard/server");

function writeConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
  const configPath = path.join(rootDir, "safa.config.json");
  fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  return configPath;
}

test("dashboard start requires owner token", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-dashboard-"));
  const configPath = writeConfig(rootDir, {});
  const previous = process.env.SAFA_OWNER_TOKEN;
  delete process.env.SAFA_OWNER_TOKEN;
  let exitCode: number | undefined;
  try {
    await startDashboardServer(["--config", configPath, "--port", "0"], {
      exit: (code: number) => {
        exitCode = code;
      }
    });
  } catch (error) {
    if (!String(error).includes("__EXIT__")) {
      throw error;
    }
  } finally {
    if (previous !== undefined) {
      process.env.SAFA_OWNER_TOKEN = previous;
    }
  }
  assert.equal(exitCode, 1);
});

test("dashboard denies start when kill switch is off", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: false } });
  process.env.SAFA_OWNER_TOKEN = "token";
  let exitCode: number | undefined;
  try {
    await startDashboardServer(["--config", configPath, "--port", "0"], {
      exit: (code: number) => {
        exitCode = code;
      }
    });
  } catch (error) {
    if (!String(error).includes("__EXIT__")) {
      throw error;
    }
  }
  assert.equal(exitCode, 1);
});
test("dashboard can start with kill switch enabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: true } });
  process.env.SAFA_OWNER_TOKEN = "token";
  const server = await startDashboardServer({ configPath, port: 0 });
  const address = server.address();
  if (address && typeof address === "object") {
    assert.equal(address.address, "127.0.0.1");
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
