export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadConfig } = require("../src/core/config");
const { createDashboardServer } = require("../src/dashboard/server");

function writeConfig(rootDir: string, overrides: Record<string, unknown> = {}) {
  const configPath = path.join(rootDir, "safa.config.json");
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

async function api(
  port: number,
  pathName: string,
  body?: Record<string, unknown>,
  cookie?: string
) {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { statusCode: res.status, body: await readJson(res) };
}

async function unlock(port: number, pin: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/auth/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });
  const cookie = res.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Missing Set-Cookie on unlock.");
  }
  return cookie;
}

function postCommand(
  port: number,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = require("node:http").request(
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

test("dashboard run read_file succeeds", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-cmd-"));
  const config = writeConfig(rootDir, {
    killSwitch: { enabled: true },
    governance: { strictApprovalMode: false },
    permissions: { readAllowlist: ["."] }
  });
  fs.writeFileSync(path.join(rootDir, "sample.txt"), "hello");
  await withServer(config, async (port) => {
    const cookie = await unlock(port, "1234");
    const response = await api(port, "/api/run", {
      skill: "read_file",
      input: { path: "sample.txt" },
      approve: true,
      actor: "tester"
    }, cookie);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "OK");
    assert.equal(response.body.output.content, "hello");
  });
});

test("dashboard denies network command when network OFF", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-cmd-"));
  const config = writeConfig(rootDir, {
    killSwitch: { enabled: false },
    governance: { strictApprovalMode: false }
  });
  await withServer(config, async (port) => {
    const cookie = await unlock(port, "1234");
    const pending = await api(port, "/api/run", {
      skill: "send_http_request",
      input: { method: "GET", url: "https://example.com" },
      approve: false,
      actor: "tester"
    }, cookie);
    const approved = await api(port, "/api/approve", {
      approvalId: pending.body.approvalId,
      decision: "APPROVE",
      actor: "tester"
    }, cookie);
    assert.equal(approved.body.status, "APPROVED");
    const response = await api(port, "/api/run", {
      skill: "send_http_request",
      input: { method: "GET", url: "https://example.com" },
      approve: true,
      approvalId: pending.body.approvalId,
      actor: "tester"
    }, cookie);
    assert.equal(response.statusCode, 403);
    assert.match(response.body.error, /network is disabled/i);
  });
});

test("dashboard denies network command when kill switch ON", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-cmd-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const cookie = await unlock(port, "1234");
    const response = await postCommand(
      port,
      { Cookie: cookie },
      {
        line: 'SAFA: RUN send_http_request {"method":"GET","url":"https://example.com"}',
        mode: "SCRIPT",
        authority: "OWNER",
        approve: true,
        dryRun: true
      }
    );
    assert.equal(response.body.denied, true);
    assert.match(response.body.reason, /kill switch|network/i);
  });
});

test("dashboard allows high-risk local skills with approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-cmd-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const cookie = await unlock(port, "1234");
    const response = await postCommand(
      port,
      { Cookie: cookie },
      {
        line: 'SAFA: RUN request_web_build {"projectName":"demo","description":"site"}',
        mode: "SCRIPT",
        authority: "OWNER",
        approve: true,
        dryRun: true
      }
    );
    assert.equal(response.body.ok, true);
    assert.equal(response.body.denied, false);
  });
});

test("dashboard allows local execution when dryRun is false", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-cmd-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const cookie = await unlock(port, "1234");
    const response = await postCommand(
      port,
      { Cookie: cookie },
      {
        line: 'SAFA: RUN write_file {"path":"data/local.txt","content":"ok","createDirs":true}',
        mode: "SCRIPT",
        authority: "OWNER",
        approve: true,
        dryRun: false
      }
    );
    assert.equal(response.body.ok, true);
    const filePath = path.join(rootDir, "data", "local.txt");
    assert.ok(fs.existsSync(filePath));
  });
});

test("dashboard freeze blocks further activity", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-freeze-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const cookie = await unlock(port, "1234");
    const freezeResponse = await postCommand(
      port,
      { Cookie: cookie },
      {
        line: 'SAFA: RUN freeze_system {"reason":"test"}',
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
      { Cookie: cookie },
      {
        line: 'SAFA: RUN read_file {"path":"README.md"}',
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
