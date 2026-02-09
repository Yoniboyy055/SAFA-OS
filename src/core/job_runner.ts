import type { AuditLogger } from "./audit";
import type { ResolvedConfig } from "./config";
import type { Governor } from "./governor";
import { ApprovalStore, shouldRequireApproval } from "./approval_store";
import { createApprovalRequest, expireRequest } from "./approvals";
import { NotificationBridge } from "./notification_bridge";
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
  return shouldRequireApproval(step.riskLevel);
}

function findNextStep(job: JobRecord): JobStep | undefined {
  return job.steps.find(
    (step) => step.status === "PENDING" || step.status === "APPROVED"
  );
}

function findPausedStep(job: JobRecord): JobStep | undefined {
  return job.steps.find((step) => step.status === "PAUSED");
}

function buildReasonCode(step: JobStep, config: ResolvedConfig): string {
  if (config.governance?.strictApprovalMode) {
    return "strict_mode";
  }
  if (step.requiresApproval === true) {
    return "step_requires_approval";
  }
  const level = resolveRiskLevel(step);
  return `risk_${level.toLowerCase()}`;
}

function findInFlightStep(job: JobRecord): JobStep | undefined {
  return job.steps.find(
    (step) => step.status === "RUNNING" || step.status === "PENDING" || step.status === "APPROVED"
  );
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
    const jobs = listJobs(this.context.config.rootDir);
    if (jobs.length === 0) {
      return null;
    }

    if (this.context.config.killSwitch?.enabled) {
      let pausedJob: JobRecord | null = null;
      jobs.forEach((job) => {
        if (job.status !== "QUEUED" && job.status !== "RUNNING") {
          return;
        }
        const step = findInFlightStep(job);
        if (step && step.status !== "PAUSED" && step.status !== "COMPLETED") {
          step.status = "PAUSED";
          step.error = "Kill switch engaged.";
        }
        job.status = "PAUSED";
        job.error = "Kill switch engaged.";
        pausedJob = upsertJob(this.context.config.rootDir, job);
        this.context.audit.log({
          timestamp: new Date().toISOString(),
          actor: this.context.actor,
          action: "kill_switch.paused",
          approved: false,
          target: `job:${job.id}`,
          result: "Job paused."
        });
      });
      return pausedJob;
    }

    const approvalStore = new ApprovalStore(this.context.config.rootDir);

    let job = jobs.find((entry) => entry.status === "PAUSED");
    if (job) {
      const pausedStep = findPausedStep(job);
      if (!pausedStep) {
        return job;
      }
      const approval = approvalStore.getByJob(job.id, pausedStep.id);
      if (!approval) {
        return job;
      }
      if (approval.status === "PENDING" && isExpired(approval.expiresAt)) {
        const expired = expireRequest(approval, {
          actor: this.context.actor,
          audit: this.context.audit
        }, "Approval expired.");
        approvalStore.upsert(expired);
        pausedStep.status = "FAILED";
        pausedStep.error = "Approval expired.";
        job.status = "EXPIRED";
        job.error = "Approval expired.";
        return upsertJob(this.context.config.rootDir, job);
      }
      if (approval.status === "PENDING") {
        return job;
      }
      if (approval.status === "DENIED") {
        pausedStep.status = "FAILED";
        pausedStep.error = "Approval denied.";
        job.status = "FAILED";
        job.error = "Approval denied.";
        return upsertJob(this.context.config.rootDir, job);
      }
      if (approval.status === "EXPIRED") {
        pausedStep.status = "FAILED";
        pausedStep.error = "Approval expired.";
        job.status = "EXPIRED";
        job.error = "Approval expired.";
        return upsertJob(this.context.config.rootDir, job);
      }

      pausedStep.status = "APPROVED";
      pausedStep.approvalId = approval.id;
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
      const existing = approvalStore.getByJob(job.id, step.id);
      if (!existing) {
        const request = createApprovalRequest(
          {
            action: "job.step",
            target: step.id,
            jobId: job.id,
            riskLevel: resolveRiskLevel(step),
            reasonCode: buildReasonCode(step, this.context.config),
            policy: { expiresInMs: job.ttlMs }
          },
          { actor: job.ownerId, audit: this.context.audit }
        );
        approvalStore.upsert(request);
        step.approvalId = request.id;
        const notifier = new NotificationBridge(
          this.context.config.rootDir,
          this.context.audit
        );
        notifier.notifyApprovalNeeded(job.id);
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
