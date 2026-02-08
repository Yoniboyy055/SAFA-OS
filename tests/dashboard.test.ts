export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDashboardServer } = require("../src/dashboard/server");

async function startServer(configPath: string) {
  const server = createDashboardServer({ configPath, actorDefault: "tester" });
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
  payload?: unknown
) {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined
  });
  return readJson(res);
}

test("dashboard api enforces approval and redaction", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-dashboard-"));
  const samplePath = path.join(rootDir, "sample.txt");
  fs.writeFileSync(samplePath, "hello");
  const configPath = path.join(rootDir, "jarvis.config.json");
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
    const state = await api(port, "GET", "/api/state");
    assert.equal(state.networkEnabled, false);
    assert.equal(state.strictApprovalMode, true);

    const skills = await api(port, "GET", "/api/skills");
    assert.ok(Array.isArray(skills.skills));
    assert.ok(skills.skills.find((skill: { name: string }) => skill.name === "read_file"));

    const pending = await api(port, "POST", "/api/run", {
      skill: "read_file",
      input: { path: "sample.txt", token: "SECRET" },
      approve: false,
      actor: "tester"
    });
    assert.equal(pending.status, "PENDING_APPROVAL");
    assert.ok(pending.approvalId);

    const approved = await api(port, "POST", "/api/approve", {
      approvalId: pending.approvalId,
      decision: "APPROVE",
      actor: "tester"
    });
    assert.equal(approved.status, "APPROVED");

    const runResult = await api(port, "POST", "/api/run", {
      skill: "read_file",
      input: { path: "sample.txt", token: "SECRET" },
      approve: true,
      approvalId: pending.approvalId,
      actor: "tester"
    });
    assert.equal(runResult.status, "OK");
    assert.equal(runResult.output.content, "hello");

    const executions = await api(port, "GET", "/api/executions?limit=5");
    assert.ok(Array.isArray(executions.executions));
    assert.ok(executions.executions.length > 0);

    const network = await api(port, "POST", "/api/network", {
      enabled: true,
      approve: true,
      actor: "tester"
    });
    assert.ok(network.error);

    const audit = await api(port, "GET", "/api/audit/tail?limit=10");
    assert.ok(Array.isArray(audit.events));
    assert.ok(audit.events.length > 0);
    const auditText = JSON.stringify(audit.events);
    assert.ok(!auditText.includes("SECRET"));
  } finally {
    server.close();
  }
});
