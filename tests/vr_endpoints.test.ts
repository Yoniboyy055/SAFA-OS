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

function request(
  method: string,
  pathname: string,
  port: number,
  headers: Record<string, string> = {},
  body?: Record<string, unknown>
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: { "Content-Type": "application/json", ...headers }
      },
      (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => {
          data += String(chunk);
        });
        res.on("end", () => {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ statusCode: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function unlock(port: number, pin: string): Promise<string> {
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
        res.on("data", () => undefined);
        res.on("end", () => {
          const cookie = res.headers["set-cookie"];
          if (Array.isArray(cookie)) {
            resolve(cookie[0]);
          } else if (cookie) {
            resolve(cookie);
          } else {
            reject(new Error("Missing Set-Cookie on unlock."));
          }
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

test("vr status returns enabled and disarmed", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-vr-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  await withServer(config, async (port) => {
    const cookie = await unlock(port, "1234");
    const response = await request("GET", "/vr/status", port, { Cookie: cookie });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.enabled, true);
    assert.equal(response.body.armed, false);
  });
});

test("vr arm requires env, approval, and override", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-vr-"));
  const config = writeConfig(rootDir, { killSwitch: { enabled: true } });
  const previous = process.env.SAFA_VR_ARMED;
  delete process.env.SAFA_VR_ARMED;
  await withServer(config, async (port) => {
    const cookie = await unlock(port, "1234");
    const denied = await request(
      "POST",
      "/vr/arm",
      port,
      { Cookie: cookie },
      { mode: "SCRIPT", authority: "OWNER", approve: true }
    );
    assert.equal(denied.body.denied, true);
    assert.match(
      denied.body.reason,
      /override|vr hardware|disarmed|SAFA_VR_ARMED/i
    );

    process.env.SAFA_VR_ARMED = "1";
    const missingOverride = await request(
      "POST",
      "/vr/arm",
      port,
      { Cookie: cookie },
      { mode: "SCRIPT", authority: "OWNER", approve: true }
    );
    assert.equal(missingOverride.body.denied, true);
    assert.match(missingOverride.body.reason, /override/i);

    const allowed = await request(
      "POST",
      "/vr/arm",
      port,
      { Cookie: cookie },
      { mode: "SCRIPT", authority: "OWNER", approve: true, overrideKillSwitch: true }
    );
    assert.equal(allowed.body.ok, true);
    assert.equal(allowed.body.state.armed, true);

    const disarm = await request(
      "POST",
      "/vr/disarm",
      port,
      { Cookie: cookie },
      { mode: "SCRIPT", authority: "OWNER", approve: true }
    );
    assert.equal(disarm.body.ok, true);
    assert.equal(disarm.body.state.armed, false);
  });
  if (previous !== undefined) {
    process.env.SAFA_VR_ARMED = previous;
  } else {
    delete process.env.SAFA_VR_ARMED;
  }
});
