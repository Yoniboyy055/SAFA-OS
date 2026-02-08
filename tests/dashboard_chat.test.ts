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

test("chat requires token", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-chat-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const response = await postChat(port, {}, { message: "Status" });
    assert.equal(response.statusCode, 401);
  });
});

test("chat returns a draft plan", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-chat-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const response = await postChat(
      port,
      { "X-Owner-Token": "token" },
      { message: "Help me plan tomorrow" }
    );
    assert.equal(response.statusCode, 200);
    assert.match(response.body.message, /draft plan/i);
    assert.ok(response.body.evidenceSummary);
  });
});

test("chat approval flow executes read_file", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-chat-"));
  const docsDir = path.join(rootDir, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "note.txt"), "hello", "utf8");
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const sessionId = "sess-test";
    const propose = await postChat(
      port,
      { "X-Owner-Token": "token", "X-Session-Id": sessionId },
      { message: "Read docs/note.txt" }
    );
    assert.equal(propose.statusCode, 200);
    assert.match(propose.body.message, /approve/i);

    const approve = await postChat(
      port,
      { "X-Owner-Token": "token", "X-Session-Id": sessionId },
      { message: "Yes" }
    );
    assert.equal(approve.statusCode, 200);
    assert.match(approve.body.message, /done/i);
    assert.ok(approve.body.evidenceSummary);
  });
});
