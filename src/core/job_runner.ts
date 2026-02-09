import type { AuditLogger } from "./audit";
import type { ResolvedConfig } from "./config";
import type { Governor } from "./governor";
import { ApprovalQueueStore } from "./approval_queue_store";
import { createApprovalRequest } from "./approvals";
import { readFreezeState } from "./freeze";
import { withDelegatedJobContext } from "./execution_gate";
import { buildRegistry } from "../skills/registry_factory";
import type { SkillRegistry } from "../skills/registry";
import type { RiskLevel } from "../types/skill";
import { AuthorityLevel } from "./authority";
import { listJobs, upsertJob, type JobRecord, type JobStep } from "./job_store";

export interface JobRunnerContext {
  actor: string;
  audit: AuditLogger;
  config: ResolvedConfig;
  governor: Governor;
}

export interface JobStepExecutorResult {
  success: boolean;
  error?: string;
}

export type JobStepExecutor = (
  job: JobRecord,
  step: JobStep,
  context: JobRunnerContext,
  approved: boolean
) => Promise<JobStepExecutorResult>;

function isExpired(timestamp?: string): boolean {
  if (!timestamp) {
    return false;
  }
  const expiry = Date.parse(timestamp);
  return Number.isNaN(expiry) || Date.now() >= expiry;
}

function resolveRiskLevel(step: JobStep): RiskLevel {
  return step.riskLevel ?? "LOW";
}

function needsApproval(step: JobStep, config: ResolvedConfig): boolean {
  if (config.governance?.strictApprovalMode) {
    return true;
  }
  if (step.requiresApproval === true) {
    return true;
  }
  return resolveRiskLevel(step) !== "LOW";
}

function findNextStep(job: JobRecord): JobStep | undefined {
  return job.steps.find(
    (step) => step.status === "PENDING" || step.status === "APPROVED"
  );
}

function findPausedStep(job: JobRecord): JobStep | undefined {
  return job.steps.find((step) => step.status === "PAUSED");
}

function getApprovalKey(job: JobRecord, step: JobStep): string {
  return `job:${job.id}:${step.id}`;
}

export class JobRunner {
  private timer?: NodeJS.Timeout;
  private readonly registry: SkillRegistry;
  private readonly executor: JobStepExecutor;

  constructor(
    private readonly context: JobRunnerContext,
    options?: { registry?: SkillRegistry; executor?: JobStepExecutor }
  ) {
    this.registry = options?.registry ?? buildRegistry();
    this.executor = options?.executor ?? this.executeWithRegistry.bind(this);
  }

  start(pollIntervalMs = 1000): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.context.audit.log({
          timestamp: new Date().toISOString(),
          actor: this.context.actor,
          action: "job_runner.error",
          approved: false,
          target: "job_runner",
          result: message
        });
      });
    }, pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(): Promise<JobRecord | null> {
    const freezeState = readFreezeState(this.context.config.rootDir);
    if (freezeState.enabled) {
      return null;
    }
    if (this.context.config.killSwitch?.enabled) {
      return null;
    }

    const jobs = listJobs(this.context.config.rootDir);
    if (jobs.length === 0) {
      return null;
    }

    const approvalQueue = new ApprovalQueueStore(this.context.config.rootDir);

    let job = jobs.find((entry) => entry.status === "PAUSED");
    if (job) {
      const pausedStep = findPausedStep(job);
      if (!pausedStep) {
        return job;
      }
      const key = getApprovalKey(job, pausedStep);
      const approved = approvalQueue.findApprovedByKey(key);
      if (!approved) {
        return job;
      }
      pausedStep.status = "APPROVED";
      pausedStep.approvalId = approved.request.id;
      job.status = "QUEUED";
      job = upsertJob(this.context.config.rootDir, job);
    }

    if (!job || job.status !== "QUEUED") {
      job = jobs.find((entry) => entry.status === "QUEUED");
    }
    if (!job) {
      return null;
    }

    if (!job.token) {
      job.status = "FAILED";
      job.error = "Delegated token required.";
      return upsertJob(this.context.config.rootDir, job);
    }
    const token = job.token;
    if (isExpired(token.expiresAt) || isExpired(job.expiresAt)) {
      job.status = "EXPIRED";
      job.error = "Delegated token expired.";
      return upsertJob(this.context.config.rootDir, job);
    }

    const step = findNextStep(job);
    if (!step) {
      job.status = "COMPLETED";
      return upsertJob(this.context.config.rootDir, job);
    }

    const approvalRequired = needsApproval(step, this.context.config);
    if (approvalRequired && step.status !== "APPROVED") {
      step.status = "PAUSED";
      job.status = "PAUSED";
      const key = getApprovalKey(job, step);
      const existing = approvalQueue.list().find((record) => record.key === key);
      if (!existing) {
        const request = createApprovalRequest(
          {
            action: "job.step",
            target: key,
            policy: { expiresInMs: job.ttlMs }
          },
          { actor: job.ownerId, audit: this.context.audit }
        );
        approvalQueue.upsert({
          request,
          status: request.status,
          key,
          summary: `Approve job ${job.id} step ${step.id} (${step.skill})`
        });
        step.approvalId = request.id;
      }
      return upsertJob(this.context.config.rootDir, job);
    }

    const approved = step.status === "APPROVED" || !approvalRequired;
    job.status = "RUNNING";
    step.status = "RUNNING";
    job = upsertJob(this.context.config.rootDir, job);

    try {
      const stepContext: JobRunnerContext = {
        ...this.context,
        actor: job.ownerId
      };
      const result = await withDelegatedJobContext(
        token.token,
        job.ownerId,
        "job",
        `${job.id}:${step.id}`,
        () => this.executor(job, step, stepContext, approved)
      );
      if (result.success) {
        step.status = "COMPLETED";
      } else {
        step.status = "FAILED";
        step.error = result.error ?? "Execution failed.";
      }
    } catch (error) {
      step.status = "FAILED";
      step.error = error instanceof Error ? error.message : String(error);
    }

    const hasFailure = step.status === "FAILED";
    const remaining = job.steps.some((item) => item.status !== "COMPLETED");
    if (hasFailure) {
      job.status = "FAILED";
      job.error = step.error ?? "Job failed.";
    } else if (!remaining) {
      job.status = "COMPLETED";
      job.error = undefined;
    } else {
      job.status = "QUEUED";
    }

    return upsertJob(this.context.config.rootDir, job);
  }

  private async executeWithRegistry(
    job: JobRecord,
    step: JobStep,
    context: JobRunnerContext,
    approved: boolean
  ): Promise<JobStepExecutorResult> {
    const result = await this.registry.execute(step.skill, step.input, {
      actor: job.ownerId,
      approved,
      authority: AuthorityLevel.OWNER,
      commandMode: "SCRIPT",
      config: context.config,
      audit: context.audit,
      governor: context.governor,
      freezeEnabled: readFreezeState(context.config.rootDir).enabled
    });

    return {
      success: result.success,
      error: result.error
    };
  }
}
