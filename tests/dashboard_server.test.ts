export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startDashboardServer } = require("../src/dashboard/server");

function writeConfig(rootDir: string, overrides: Record<string, unknown>) {
  const configPath = path.join(rootDir, "jarvis.config.json");
  fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  return configPath;
}

function buildLogger() {
  return { log: () => {}, error: () => {} };
}

test("dashboard denies by default when kill switch enabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: true } });
  let exitCode: number | undefined;

  const server = await startDashboardServer(
    ["--config", configPath, "--port", "0"],
    {
      exit: (code: number) => {
        exitCode = code;
      },
      logger: buildLogger()
    }
  );

  assert.equal(exitCode, 1);
  assert.equal(server, undefined);
});

test("dashboard denies override without required flags", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: true } });
  let exitCode: number | undefined;

  const server = await startDashboardServer(
    ["--config", configPath, "--allow-dashboard-under-kill-switch", "--port", "0"],
    {
      exit: (code: number) => {
        exitCode = code;
      },
      logger: buildLogger()
    }
  );

  assert.equal(exitCode, 1);
  assert.equal(server, undefined);
});

test("dashboard allows owner override and audits", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: true } });
  let exitCode: number | undefined;

  const server = await startDashboardServer(
    [
      "--config",
      configPath,
      "--allow-dashboard-under-kill-switch",
      "--mode",
      "SCRIPT",
      "--authority",
      "OWNER",
      "--approve",
      "--actor",
      "local-owner",
      "--port",
      "0"
    ],
    {
      exit: (code: number) => {
        exitCode = code;
      },
      logger: buildLogger()
    }
  );

  assert.equal(exitCode, undefined);
  assert.ok(server);

  const address = server.address();
  if (address && typeof address === "object") {
    assert.equal(address.address, "127.0.0.1");
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));

  const logPath = path.join(rootDir, "logs", "audit.log");
  const raw = fs.readFileSync(logPath, "utf8").trim();
  const events = raw.split("\n").map((line: string) => JSON.parse(line));
  const found = events.some(
    (event: { action?: string }) =>
      event.action === "dashboard.start.override_killswitch"
  );
  assert.equal(found, true);
});
