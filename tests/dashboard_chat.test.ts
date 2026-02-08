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
  const configPath = path.join(rootDir, "safa.config.json");
  fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2));
  return loadConfig(configPath);
}

function postChat(
  port: number,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/chat",
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

function unlock(
  port: number,
  pin: string
): Promise<{ statusCode: number; cookie?: string; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/auth/unlock",
        method: "POST",
        headers: { "Content-Type": "application/json" }
      },
      (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => {
          data += String(chunk);
        });
        res.on("end", () => {
          const setCookie = res.headers["set-cookie"];
          resolve({
            statusCode: res.statusCode ?? 0,
            cookie: Array.isArray(setCookie) ? setCookie[0] : setCookie,
            body: data ? JSON.parse(data) : {}
          });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify({ pin }));
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

test("chat requires unlock", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-chat-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const response = await postChat(port, {}, { message: "Status" });
    assert.equal(response.statusCode, 401);
  });
});

test("chat returns 500 when OPENAI_API_KEY is missing", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-chat-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const unlocked = await unlock(port, "1234");
    assert.equal(unlocked.statusCode, 200);
    if (!unlocked.cookie) {
      throw new Error("Missing unlock cookie.");
    }
    const response = await postChat(
      port,
      { Cookie: unlocked.cookie },
      { message: "Hello" }
    );
    assert.equal(response.statusCode, 500);
    assert.match(response.body.error, /OPENAI_API_KEY missing/i);
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey;
    }
  });
});

