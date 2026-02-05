export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger, redactSensitive } = require("../src/core/audit");

test("audit logger appends and redacts sensitive fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-audit-"));
  const logPath = path.join(dir, "audit.log");
  const logger = new AuditLogger({
    logPath,
    redactKeys: ["token", "secret"]
  });

  logger.log({
    timestamp: "2026-02-04T00:00:00.000Z",
    actor: "tester",
    action: "test",
    approved: false,
    target: "sample",
    result: "token=abc123"
  });

  logger.log({
    timestamp: "2026-02-04T00:00:01.000Z",
    actor: "tester",
    action: "test",
    approved: true,
    target: "sample",
    result: "OK"
  });

  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]);
  const second = JSON.parse(lines[1]);
  assert.equal(first.result, "[REDACTED]");
  assert.equal(second.result, "OK");
  assert.equal(first.timestamp, "2026-02-04T00:00:00.000Z");
  const redacted = redactSensitive({ token: "abc", secret: "xyz" });
  assert.equal(redacted.token, "[REDACTED]");
  assert.equal(redacted.secret, "[REDACTED]");
});
