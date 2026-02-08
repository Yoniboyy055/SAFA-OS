export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDashboardServer } = require("../src/dashboard/server");

async function startServer(configPath: string) {
  const server = createDashboardServer({ configPath, actorDefault: "tester", ownerToken: "token" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  return { server, port };
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
  method: string,
  pathName: string,
  payload?: unknown,
  cookie?: string
) {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: payload ? JSON.stringify(payload) : undefined
  });
  return readJson(res);
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

test("dashboard api enforces approval and redaction", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-dashboard-"));
  const samplePath = path.join(rootDir, "sample.txt");
  fs.writeFileSync(samplePath, "hello");
  const configPath = path.join(rootDir, "safa.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        audit: { logPath: "logs/audit.log", redactKeys: ["token", "secret"] },
        governance: { strictApprovalMode: true },
        permissions: { readAllowlist: ["."] }
      },
      null,
      2
    )
  );

  const { server, port } = await startServer(configPath);

  try {
    const cookie = await unlock(port, "1234");
    const state = await api(port, "GET", "/api/state", undefined, cookie);
    assert.equal(state.networkEnabled, false);
    assert.equal(state.strictApprovalMode, true);

    const skills = await api(port, "GET", "/api/skills", undefined, cookie);
    assert.ok(Array.isArray(skills.skills));
    assert.ok(skills.skills.find((skill: { name: string }) => skill.name === "read_file"));

    const pending = await api(port, "POST", "/api/run", {
      skill: "read_file",
      input: { path: "sample.txt", token: "SECRET" },
      approve: false,
      actor: "tester"
    }, cookie);
    assert.equal(pending.status, "PENDING_APPROVAL");
    assert.ok(pending.approvalId);

    const approved = await api(port, "POST", "/api/approve", {
      approvalId: pending.approvalId,
      decision: "APPROVE",
      actor: "tester"
    }, cookie);
    assert.equal(approved.status, "APPROVED");

    const runResult = await api(port, "POST", "/api/run", {
      skill: "read_file",
      input: { path: "sample.txt", token: "SECRET" },
      approve: true,
      approvalId: pending.approvalId,
      actor: "tester"
    }, cookie);
    assert.equal(runResult.status, "OK");
    assert.equal(runResult.output.content, "hello");

    const executions = await api(port, "GET", "/api/executions?limit=5", undefined, cookie);
    assert.ok(Array.isArray(executions.executions));
    assert.ok(executions.executions.length > 0);

    const network = await api(port, "POST", "/api/network", {
      enabled: true,
      approve: true,
      actor: "tester"
    }, cookie);
    assert.ok(network.error);

    const audit = await api(port, "GET", "/api/audit/tail?limit=10", undefined, cookie);
    assert.ok(Array.isArray(audit.events));
    assert.ok(audit.events.length > 0);
    const auditText = JSON.stringify(audit.events);
    assert.ok(!auditText.includes("SECRET"));
  } finally {
    server.close();
  }
});
