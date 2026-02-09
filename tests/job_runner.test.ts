export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { ApprovalStore } = require("../src/core/approval_store");
const { createDelegatedJobToken } = require("../src/core/execution_gate");
const { createJob, getJob } = require("../src/core/job_store");
const { JobRunner } = require("../src/core/job_runner");

function buildContext(rootDir: string) {
  const config = {
    rootDir,
    killSwitch: { enabled: false },
    governance: { strictApprovalMode: false }
  };
  const audit = new AuditLogger({ logPath: path.join(rootDir, "audit.log"), redactKeys: [] });
  const governor = new Governor();
  return { actor: "tester", audit, config, governor };
}

function buildRunner(rootDir: string, executor?: () => Promise<{ success: boolean }>) {
  const context = buildContext(rootDir);
  const exec = executor
    ? async () => executor()
    : async () => ({ success: true });
  return new JobRunner(context, {
    executor: async (_job: any, _step: any, _ctx: any, _approved: boolean) => exec()
  });
}

test("job runner idle without jobs", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-jobs-"));
  const runner = buildRunner(rootDir);
  const result = await runner.tick();
  assert.equal(result, null);
});

test("job runner expires when token is expired", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-jobs-"));
  const runner = buildRunner(rootDir, async () => ({ success: true }));
  createJob(rootDir, {
    ownerId: "tester",
    scope: ["list_files"],
    allowedTools: ["list_files"],
    token: {
      token: "job-expired",
      actor: "tester",
      scope: ["list_files"],
      expiresAt: new Date(Date.now() - 1000).toISOString()
    },
    steps: [
      {
        id: "step-1",
        skill: "list_files",
        input: { path: "." },
        status: "PENDING"
      }
    ]
  });

  const result = await runner.tick();
  assert.equal(result?.status, "EXPIRED");
  assert.equal(getJob(rootDir, result?.id).status, "EXPIRED");
});

test("job runner pauses on approval and resumes", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-jobs-"));
  const runner = buildRunner(rootDir, async () => ({ success: true }));
  const token = createDelegatedJobToken("tester", ["list_files"], 5000);
  const job = createJob(rootDir, {
    ownerId: "tester",
    scope: ["list_files"],
    allowedTools: ["list_files"],
    token,
    steps: [
      {
        id: "step-1",
        skill: "list_files",
        input: { path: "." },
        status: "PENDING",
        riskLevel: "HIGH"
      }
    ]
  });

  const paused = await runner.tick();
  assert.equal(paused?.status, "PAUSED");

  const store = new ApprovalStore(rootDir);
  const pending = store.getByJob(job.id, "step-1");
  assert.ok(pending);

  store.resolve(pending.id, { status: "APPROVED", resolvedBy: "approver" });

  const resumed = await runner.tick();
  assert.equal(resumed?.status, "COMPLETED");
});

test("job runner pauses on medium risk", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-jobs-"));
  const runner = buildRunner(rootDir, async () => ({ success: true }));
  const token = createDelegatedJobToken("tester", ["list_files"], 5000);
  createJob(rootDir, {
    ownerId: "tester",
    scope: ["list_files"],
    allowedTools: ["list_files"],
    token,
    steps: [
      {
        id: "step-1",
        skill: "list_files",
        input: { path: "." },
        status: "PENDING",
        riskLevel: "MEDIUM"
      }
    ]
  });

  const paused = await runner.tick();
  assert.equal(paused?.status, "PAUSED");
});

test("job runner stays paused until approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-jobs-"));
  const runner = buildRunner(rootDir, async () => ({ success: true }));
  const token = createDelegatedJobToken("tester", ["list_files"], 5000);
  const job = createJob(rootDir, {
    ownerId: "tester",
    scope: ["list_files"],
    allowedTools: ["list_files"],
    token,
    steps: [
      {
        id: "step-1",
        skill: "list_files",
        input: { path: "." },
        status: "PENDING",
        riskLevel: "HIGH"
      }
    ]
  });

  const paused = await runner.tick();
  assert.equal(paused?.status, "PAUSED");

  const stillPaused = await runner.tick();
  assert.equal(stillPaused?.status, "PAUSED");

  const store = new ApprovalStore(rootDir);
  const pending = store.getByJob(job.id, "step-1");
  assert.ok(pending);
});

test("job runner fails when approval denied", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-jobs-"));
  const runner = buildRunner(rootDir, async () => ({ success: true }));
  const token = createDelegatedJobToken("tester", ["list_files"], 5000);
  const job = createJob(rootDir, {
    ownerId: "tester",
    scope: ["list_files"],
    allowedTools: ["list_files"],
    token,
    steps: [
      {
        id: "step-1",
        skill: "list_files",
        input: { path: "." },
        status: "PENDING",
        riskLevel: "HIGH"
      }
    ]
  });

  const paused = await runner.tick();
  assert.equal(paused?.status, "PAUSED");

  const store = new ApprovalStore(rootDir);
  const pending = store.getByJob(job.id, "step-1");
  assert.ok(pending);
  store.resolve(pending.id, { status: "DENIED", resolvedBy: "approver" });

  const denied = await runner.tick();
  assert.equal(denied?.status, "FAILED");
  assert.equal(denied?.error, "Approval denied.");
});

test("job runner expires when approval expires", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-jobs-"));
  const runner = buildRunner(rootDir, async () => ({ success: true }));
  const token = createDelegatedJobToken("tester", ["list_files"], 5000);
  const job = createJob(rootDir, {
    ownerId: "tester",
    scope: ["list_files"],
    allowedTools: ["list_files"],
    token,
    ttlMs: 1000,
    steps: [
      {
        id: "step-1",
        skill: "list_files",
        input: { path: "." },
        status: "PENDING",
        riskLevel: "HIGH"
      }
    ]
  });

  const paused = await runner.tick();
  assert.equal(paused?.status, "PAUSED");

  const store = new ApprovalStore(rootDir);
  const pending = store.getByJob(job.id, "step-1");
  assert.ok(pending);
  store.upsert({
    ...pending,
    expiresAt: new Date(Date.now() - 1000).toISOString()
  });

  const expired = await runner.tick();
  assert.equal(expired?.status, "EXPIRED");
  assert.equal(expired?.error, "Approval expired.");

  const updated = store.get(pending.id);
  assert.equal(updated?.status, "EXPIRED");
});

test("approval request is audited", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-jobs-"));
  const runner = buildRunner(rootDir, async () => ({ success: true }));
  const token = createDelegatedJobToken("tester", ["list_files"], 5000);
  createJob(rootDir, {
    ownerId: "tester",
    scope: ["list_files"],
    allowedTools: ["list_files"],
    token,
    steps: [
      {
        id: "step-1",
        skill: "list_files",
        input: { path: "." },
        status: "PENDING",
        riskLevel: "HIGH"
      }
    ]
  });

  const paused = await runner.tick();
  assert.equal(paused?.status, "PAUSED");

  const auditLines = fs
    .readFileSync(path.join(rootDir, "audit.log"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line: string) => JSON.parse(line));
  const hasApprovalRequest = auditLines.some(
    (entry: any) => entry.action === "approval.requested"
  );
  assert.ok(hasApprovalRequest);
});
