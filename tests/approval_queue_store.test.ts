export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ApprovalQueueStore } = require("../src/core/approval_queue_store");
const { AuditLogger } = require("../src/core/audit");
const { createApprovalRequest, approveRequest } = require("../src/core/approvals");

test("approval queue store persists pending and approved records", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-approval-queue-"));
  const audit = new AuditLogger({
    logPath: path.join(rootDir, "logs", "audit.log"),
    redactKeys: []
  });
  const store = new ApprovalQueueStore(rootDir);
  const request = createApprovalRequest(
    {
      action: "run:read_file",
      target: "read_file",
      payload: { input: { path: "README.md" }, skill: "read_file" }
    },
    { actor: "tester", audit }
  );
  store.upsert({
    request,
    status: request.status,
    key: "run:read_file",
    summary: "run -> read_file"
  });

  const pending = store.listPending();
  assert.equal(pending.length, 1);

  const approved = approveRequest(request, { actor: "owner", audit });
  store.upsert({
    request: approved,
    status: approved.status,
    key: "run:read_file",
    summary: "run -> read_file"
  });

  const approvedRecord = store.findApprovedByKey("run:read_file");
  assert.ok(approvedRecord);
  assert.equal(approvedRecord.status, "APPROVED");
});
