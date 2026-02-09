export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("node:crypto");
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
  const chunks = [];
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

async function unlockRemote(port: number, pin: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/remote/unlock`, {
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

test("remote approvals require signed payload", async () => {
  const previousRemote = process.env.SAFA_REMOTE_ENABLED;
  process.env.SAFA_REMOTE_ENABLED = "1";
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-remote-"));
  const config = writeConfig(rootDir, {
    killSwitch: { enabled: true },
    governance: { strictApprovalMode: true },
    permissions: { readAllowlist: ["."] }
  });
  fs.writeFileSync(path.join(rootDir, "sample.txt"), "hello");

  await withServer(config, async (port) => {
    const cookie = await unlockRemote(port, "1234");
    const session = await api(port, "/remote/session", {}, cookie);
    assert.equal(session.statusCode, 200);
    const remoteSessionId = session.body.remoteSessionId;
    const hmacKey = session.body.hmacKey;

    const run = await api(
      port,
      "/api/run",
      { skill: "read_file", input: { path: "sample.txt" }, approve: false, actor: "tester" },
      cookie
    );
    assert.equal(run.statusCode, 202);

    const approvals = await api(port, "/api/approvals", undefined, cookie);
    assert.equal(approvals.statusCode, 200);
    assert.ok(approvals.body.approvals.length > 0);
    const approvalId = approvals.body.approvals[0].id;

    const timestamp = String(Date.now());
    const nonce = Math.random().toString(16).slice(2);
    const payload = `${remoteSessionId}.${approvalId}.APPROVE.${timestamp}.${nonce}`;
    const signature = crypto.createHmac("sha256", hmacKey).update(payload).digest("base64url");

    const approved = await api(
      port,
      "/remote/approve",
      {
        remoteSessionId,
        approvalId,
        decision: "APPROVE",
        actor: "tester",
        timestamp,
        nonce,
        signature
      },
      cookie
    );
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.body.status, "APPROVED");

    const denied = await api(
      port,
      "/remote/approve",
      {
        remoteSessionId,
        approvalId,
        decision: "DENY",
        actor: "tester",
        timestamp,
        nonce,
        signature: "invalid"
      },
      cookie
    );
    assert.equal(denied.statusCode, 401);
  });

  if (previousRemote === undefined) {
    delete process.env.SAFA_REMOTE_ENABLED;
  } else {
    process.env.SAFA_REMOTE_ENABLED = previousRemote;
  }
});
