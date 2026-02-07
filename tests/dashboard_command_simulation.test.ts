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

function postCommand(
  port: number,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/command",
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers }
      },
      (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => {
          data += String(chunk);
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0, body: JSON.parse(data) });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function withServer(
  config: ReturnType<typeof writeConfig>,
  handler: (port: number) => Promise<void>
) {
  const server = createDashboardServer(config, { ownerToken: "token" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" ? address.port : 0;
  try {
    await handler(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("dashboard dry-run read_file returns preview", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cmd-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const response = await postCommand(
      port,
      { "X-Owner-Token": "token" },
      {
        line: 'JARVIS: RUN read_file {"path":"README.md"} --approve',
        mode: "SCRIPT",
        authority: "OWNER",
        approve: true,
        dryRun: true
      }
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.ok(response.body.preview);
    assert.ok(response.body.evidence);
    assert.ok(Array.isArray(response.body.evidence.touched));
  });
});

test("dashboard denies network command when network OFF", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cmd-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const response = await postCommand(
      port,
      { "X-Owner-Token": "token" },
      {
        line: 'JARVIS: RUN send_http_request {"method":"GET","url":"https://example.com"}',
        mode: "SCRIPT",
        authority: "OWNER",
        approve: true,
        dryRun: true,
        allowUnderKillSwitch: false
      }
    );
    assert.equal(response.body.denied, true);
    assert.match(response.body.reason, /safe mode|read-only|network/i);
  });
});

test("dashboard denies high-risk skills in safe mode", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cmd-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const response = await postCommand(
      port,
      { "X-Owner-Token": "token" },
      {
        line: 'JARVIS: RUN request_web_build {"projectName":"demo","description":"site"}',
        mode: "SCRIPT",
        authority: "OWNER",
        approve: true,
        dryRun: true
      }
    );
    assert.equal(response.body.denied, true);
    assert.match(response.body.reason, /safe mode|read-only/i);
  });
});

test("dashboard denies when dryRun is false", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-cmd-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const response = await postCommand(
      port,
      { "X-Owner-Token": "token" },
      {
        line: "JARVIS: STATUS",
        mode: "SCRIPT",
        authority: "OWNER",
        dryRun: false
      }
    );
    assert.equal(response.body.denied, true);
    assert.match(response.body.reason, /dry-run/i);
  });
});

test("dashboard freeze blocks further activity", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-freeze-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const freezeResponse = await postCommand(
      port,
      { "X-Owner-Token": "token" },
      {
        line: 'JARVIS: RUN freeze_system {"reason":"test"}',
        mode: "SCRIPT",
        authority: "OWNER",
        approve: true,
        dryRun: true
      }
    );
    assert.equal(freezeResponse.body.ok, true);
    assert.equal(freezeResponse.body.freezeUpdated, true);

    const response = await postCommand(
      port,
      { "X-Owner-Token": "token" },
      {
        line: 'JARVIS: RUN read_file {"path":"README.md"}',
        mode: "SCRIPT",
        authority: "OWNER",
        approve: true,
        dryRun: true
      }
    );
    assert.equal(response.body.denied, true);
    assert.match(response.body.reason, /freeze/i);
  });
});
