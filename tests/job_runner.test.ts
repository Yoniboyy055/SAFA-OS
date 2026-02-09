export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { ApprovalQueueStore } = require("../src/core/approval_queue_store");
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

  const queue = new ApprovalQueueStore(rootDir);
  const record = queue
    .list()
    .find((entry: any) => entry.key === `job:${job.id}:step-1`);
  assert.ok(record);

  queue.upsert({
    ...record,
    status: "APPROVED",
    request: { ...record.request, status: "APPROVED" }
  });

  const resumed = await runner.tick();
  assert.equal(resumed?.status, "COMPLETED");
});
