export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createApprovalRequest,
  approveRequest,
  denyRequest,
  revokeRequest,
  createReceipt,
  isExpired
} = require("../src/core/approvals");
const { AuditLogger } = require("../src/core/audit");

function buildAudit(rootDir) {
  return new AuditLogger({ logPath: path.join(rootDir, "audit.log"), redactKeys: [] });
}

test("approval request hashes plan + payload and logs", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-approval-"));
  const audit = buildAudit(rootDir);
  const approval = createApprovalRequest(
    {
      action: "email.preview",
      target: "user@allow.com",
      plan: { to: "user@allow.com" },
      payload: { body: "SECRET_BODY" },
      policy: { requirePlanHash: true, requirePayloadHash: true, expiresInMs: 1000 }
    },
    { actor: "owner", audit }
  );
  assert.equal(approval.status, "PENDING");
  assert.ok(approval.planHash);
  assert.ok(approval.payloadHash);
  assert.ok(approval.expiresAt);
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(!log.includes("SECRET_BODY"));
});

test("approval denial is recorded", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-approval-"));
  const audit = buildAudit(rootDir);
  const approval = createApprovalRequest(
    {
      action: "payment.preview",
      target: "price_basic"
    },
    { actor: "owner", audit }
  );
  const denied = denyRequest(approval, { actor: "owner", audit }, "Not allowed");
  assert.equal(denied.status, "DENIED");
  assert.equal(denied.reason, "Not allowed");
});

test("approval can be revoked", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-approval-"));
  const audit = buildAudit(rootDir);
  const approval = createApprovalRequest(
    {
      action: "email.preview",
      target: "user@allow.com"
    },
    { actor: "owner", audit }
  );
  const revoked = revokeRequest(approval, { actor: "owner", audit }, "Revoked");
  assert.equal(revoked.status, "DENIED");
  assert.equal(revoked.reason, "Revoked");
});

test("approval expiry is detected", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-approval-"));
  const audit = buildAudit(rootDir);
  const approval = createApprovalRequest(
    {
      action: "call.preview",
      target: "+15550002222",
      policy: { expiresInMs: 1 }
    },
    { actor: "owner", audit }
  );
  assert.equal(isExpired(approval, Date.now() + 10), true);
});

test("receipt is immutable and audited", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-approval-"));
  const audit = buildAudit(rootDir);
  const approval = createApprovalRequest(
    {
      action: "post.preview",
      target: "x.com"
    },
    { actor: "owner", audit }
  );
  const approved = approveRequest(approval, { actor: "owner", audit });
  const receipt = createReceipt(
    {
      approval: approved,
      action: "post.preview",
      target: "x.com",
      actor: "owner",
      approved: true,
      status: "SUCCESS",
      result: { id: "preview-1" }
    },
    { actor: "owner", audit }
  );
  assert.ok(Object.isFrozen(receipt));
  assert.ok(receipt.id);
  const log = fs.readFileSync(path.join(rootDir, "audit.log"), "utf8");
  assert.ok(log.includes("receipt.created"));
});
