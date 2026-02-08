export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ExecutionStore } = require("../src/core/execution_store");

test("execution store appends and returns recent entries", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-exec-store-"));
  const store = new ExecutionStore(rootDir);
  store.append({
    id: "exec-1",
    kind: "plan",
    actor: "tester",
    success: true,
    createdAt: new Date().toISOString(),
    planHash: "plan-123",
    steps: [{ stepId: "step-1", skill: "read_file", success: true }]
  });

  const entries = store.list(10);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "exec-1");
});
