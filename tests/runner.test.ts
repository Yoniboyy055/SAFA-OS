export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { LocalTaskRunner } = require("../src/core/runner");
const { enableFreeze } = require("../src/core/freeze");
const { AuditLogger } = require("../src/core/audit");

function buildRunner(rootDir: string, overrides: Record<string, unknown> = {}) {
  const config = {
    rootDir,
    killSwitch: { enabled: false },
    ...overrides
  };
  const audit = new AuditLogger({ logPath: path.join(rootDir, "audit.log"), redactKeys: [] });
  return new LocalTaskRunner({ actor: "owner", audit, config });
}

test("runner skips unapproved intents", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-runner-"));
  const runner = buildRunner(rootDir);
  runner.enqueue({
    id: "intent-1",
    description: "Local task",
    commandMode: "BUILD",
    payload: {}
  });
  const result = await runner.runNext(async () => {});
  assert.equal(result, null);
});

test("runner executes approved intents", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-runner-"));
  const runner = buildRunner(rootDir);
  runner.enqueue({
    id: "intent-2",
    description: "Local task",
    commandMode: "CREATE",
    payload: {}
  });
  runner.approveIntent("intent-2", "owner");
  const result = await runner.runNext(async () => {});
  assert.equal(result.status, "COMPLETED");
});

test("runner blocks when kill switch enabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-runner-"));
  const runner = buildRunner(rootDir, { killSwitch: { enabled: true } });
  await assert.rejects(() => runner.runNext(async () => {}), /Kill switch/i);
});

test("runner blocks when freeze enabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-runner-"));
  enableFreeze(rootDir, "owner", "test");
  const runner = buildRunner(rootDir);
  await assert.rejects(() => runner.runNext(async () => {}), /Freeze engaged/i);
});

test("runner can be interrupted during execution", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-runner-"));
  const runner = buildRunner(rootDir);
  runner.enqueue({
    id: "intent-3",
    description: "Interruptible task",
    commandMode: "DECIDE",
    payload: {}
  });
  runner.approveIntent("intent-3", "owner");
  const result = await runner.runNext(async () => {
    runner.interrupt();
  });
  assert.equal(result.status, "INTERRUPTED");
});
