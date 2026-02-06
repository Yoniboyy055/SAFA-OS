import type { AuditLogger } from "./audit";
import type { ResolvedConfig } from "./config";

export type IntentStatus =
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "INTERRUPTED";

export interface Intent {
  id: string;
  description: string;
  commandMode: import("../cli/command_mode").CommandMode;
  payload: Record<string, unknown>;
  status: IntentStatus;
  createdAt: string;
  updatedAt?: string;
  approvedBy?: string;
  deniedBy?: string;
  error?: string;
}

export interface RunnerState {
  active?: Intent;
  queue: Intent[];
  interrupted: boolean;
}

export interface RunnerContext {
  actor: string;
  audit: AuditLogger;
  config: ResolvedConfig;
}

export class LocalTaskRunner {
  private readonly queue: Intent[] = [];
  private active?: Intent;
  private interrupted = false;

  constructor(private readonly context: RunnerContext) {}

  enqueue(input: Omit<Intent, "status" | "createdAt">): Intent {
    const createdAt = new Date().toISOString();
    const intent: Intent = {
      ...input,
      status: "PENDING",
      createdAt
    };
    this.queue.push(intent);
    this.context.audit.log({
      timestamp: createdAt,
      actor: this.context.actor,
      action: "runner.enqueued",
      approved: false,
      target: intent.id,
      result: intent.description
    });
    return intent;
  }

  approveIntent(id: string, actor: string): Intent {
    const intent = this.findIntent(id);
    intent.status = "APPROVED";
    intent.approvedBy = actor;
    intent.updatedAt = new Date().toISOString();
    this.context.audit.log({
      timestamp: intent.updatedAt,
      actor,
      action: "runner.approved",
      approved: true,
      target: intent.id,
      result: intent.description
    });
    return intent;
  }

  denyIntent(id: string, actor: string, reason: string): Intent {
    const intent = this.findIntent(id);
    intent.status = "DENIED";
    intent.deniedBy = actor;
    intent.error = reason;
    intent.updatedAt = new Date().toISOString();
    this.context.audit.log({
      timestamp: intent.updatedAt,
      actor,
      action: "runner.denied",
      approved: false,
      target: intent.id,
      result: reason
    });
    return intent;
  }

  interrupt(): void {
    this.interrupted = true;
    this.context.audit.log({
      timestamp: new Date().toISOString(),
      actor: this.context.actor,
      action: "runner.interrupted",
      approved: false,
      target: this.active?.id ?? "runner",
      result: "Interrupt requested."
    });
  }

  getState(): RunnerState {
    return {
      active: this.active ? { ...this.active } : undefined,
      queue: this.queue.map((intent) => ({ ...intent })),
      interrupted: this.interrupted
    };
  }

  async runNext(
    executor: (intent: Intent) => Promise<void>
  ): Promise<Intent | null> {
    if (this.context.config.killSwitch.enabled) {
      const reason = "Kill switch enabled.";
      this.context.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.context.actor,
        action: "runner.denied",
        approved: false,
        target: "runner",
        result: reason
      });
      throw new Error(reason);
    }

    if (this.interrupted) {
      return null;
    }

    const next = this.queue.find((intent) => intent.status === "APPROVED");
    if (!next) {
      return null;
    }

    this.active = next;
    next.status = "RUNNING";
    next.updatedAt = new Date().toISOString();

    this.context.audit.log({
      timestamp: next.updatedAt,
      actor: this.context.actor,
      action: "runner.started",
      approved: true,
      target: next.id,
      result: next.description
    });

    try {
      await executor(next);
      if (this.interrupted) {
        next.status = "INTERRUPTED";
        next.updatedAt = new Date().toISOString();
        this.context.audit.log({
          timestamp: next.updatedAt,
          actor: this.context.actor,
          action: "runner.interrupted",
          approved: false,
          target: next.id,
          result: "Execution interrupted."
        });
      } else {
        next.status = "COMPLETED";
        next.updatedAt = new Date().toISOString();
        this.context.audit.log({
          timestamp: next.updatedAt,
          actor: this.context.actor,
          action: "runner.completed",
          approved: true,
          target: next.id,
          result: "Success"
        });
      }
    } catch (error) {
      next.status = "FAILED";
      next.error = error instanceof Error ? error.message : String(error);
      next.updatedAt = new Date().toISOString();
      this.context.audit.log({
        timestamp: next.updatedAt,
        actor: this.context.actor,
        action: "runner.failed",
        approved: false,
        target: next.id,
        result: next.error
      });
    } finally {
      this.active = undefined;
    }

    return next;
  }

  private findIntent(id: string): Intent {
    const intent = this.queue.find((item) => item.id === id);
    if (!intent) {
      throw new Error(`Intent not found: ${id}`);
    }
    return intent;
  }
}
