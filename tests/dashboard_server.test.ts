export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("node:http");
const { startDashboardServer } = require("../src/dashboard/server");

function writeConfig(rootDir: string, overrides: Record<string, unknown>) {
  const configPath = path.join(rootDir, "jarvis.config.json");
  fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  return configPath;
}

function buildLogger() {
  return { log: () => {}, error: () => {} };
}

async function withOwnerToken(
  token: string,
  fn: () => Promise<unknown>
): Promise<unknown> {
  const previous = process.env.JARVIS_OWNER_TOKEN;
  process.env.JARVIS_OWNER_TOKEN = token;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.JARVIS_OWNER_TOKEN;
    } else {
      process.env.JARVIS_OWNER_TOKEN = previous;
    }
  }
}

function requestJson(
  port: number,
  options: { method: string; path: string; headers?: Record<string, string> },
  body?: string
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: options.path,
        method: options.method,
        headers: options.headers ?? {}
      },
      (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => {
          data += String(chunk);
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ statusCode: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

test("dashboard denies by default when kill switch enabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: true } });
  let exitCode: number | undefined;
  await withOwnerToken("token", async () => {
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
});

test("dashboard denies override without required flags", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: true } });
  let exitCode: number | undefined;
  await withOwnerToken("token", async () => {
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
});

test("dashboard allows owner override and audits", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: true } });
  let exitCode: number | undefined;
  await withOwnerToken("token", async () => {
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
});

test("dashboard denies command when token is missing", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: false } });

  await withOwnerToken("token", async () => {
    const server = await startDashboardServer(
      ["--config", configPath, "--port", "0", "--mode", "SCRIPT", "--authority", "OWNER", "--approve"],
      {
        logger: buildLogger()
      }
    );
    const address = server.address();
    const port = typeof address === "object" ? address.port : 0;

    const response = await requestJson(
      port,
      { method: "POST", path: "/command" },
      JSON.stringify({ line: "JARVIS: RUN log_interaction {\"text\":\"hello\"} --approve" })
    );
    assert.equal(response.statusCode, 401);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

test("dashboard audits every command request", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const configPath = writeConfig(rootDir, { killSwitch: { enabled: false } });

  await withOwnerToken("token", async () => {
    const server = await startDashboardServer(
      ["--config", configPath, "--port", "0", "--mode", "SCRIPT", "--authority", "OWNER", "--approve"],
      {
        logger: buildLogger()
      }
    );
    const address = server.address();
    const port = typeof address === "object" ? address.port : 0;

    const response = await requestJson(
      port,
      {
        method: "POST",
        path: "/command",
        headers: {
          "x-jarvis-owner-token": "token"
        }
      },
      JSON.stringify({
        line: "JARVIS: RUN log_interaction {\"text\":\"hello\"} --approve"
      })
    );
    assert.equal(response.statusCode, 200);

    await new Promise<void>((resolve) => server.close(() => resolve()));

    const logPath = path.join(rootDir, "logs", "audit.log");
    const raw = fs.readFileSync(logPath, "utf8").trim();
    const events = raw.split("\n").map((line: string) => JSON.parse(line));
    const found = events.some(
      (event: { action?: string }) => event.action === "dashboard.command"
    );
    assert.equal(found, true);
  });
});
