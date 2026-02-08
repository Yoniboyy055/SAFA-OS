export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ApprovalStore } = require("../src/core/approval_store");

test("approval store persists approvals and log", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-approvals-"));
  const store = new ApprovalStore(rootDir);
  const request = {
    id: "apr-test",
    action: "unit",
    target: "local",
    actor: "tester",
    status: "PENDING",
    createdAt: new Date().toISOString()
  };
  store.upsert(request);

  const storedPath = path.join(rootDir, "data", "approvals.json");
  const logPath = path.join(rootDir, "data", "approvals.log");
  assert.ok(fs.existsSync(storedPath));
  assert.ok(fs.existsSync(logPath));
  const saved = JSON.parse(fs.readFileSync(storedPath, "utf8"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "apr-test");
  const log = fs.readFileSync(logPath, "utf8");
  assert.ok(log.includes("apr-test"));
});
