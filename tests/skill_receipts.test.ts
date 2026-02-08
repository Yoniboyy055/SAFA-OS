export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  recordSkillReceipt,
  listSkillReceipts,
  hashInput,
  hashOutput
} = require("../src/core/skill_receipt_store");

test("skill receipts persist to json and log", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-skill-"));
  const receipt = {
    id: "rcpt-test",
    skill: "read_file",
    status: "SUCCESS",
    actor: "tester",
    approved: true,
    createdAt: new Date().toISOString(),
    inputHash: hashInput({ path: "README.md" }),
    outputHash: hashOutput({ content: "ok" })
  };
  recordSkillReceipt(rootDir, receipt);

  const receipts = listSkillReceipts(rootDir);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].id, "rcpt-test");

  const jsonPath = path.join(rootDir, "data", "skill_receipts.json");
  const logPath = path.join(rootDir, "data", "skill_receipts.log");
  assert.ok(fs.existsSync(jsonPath));
  assert.ok(fs.existsSync(logPath));
  const log = fs.readFileSync(logPath, "utf8");
  assert.ok(log.includes("rcpt-test"));
});
