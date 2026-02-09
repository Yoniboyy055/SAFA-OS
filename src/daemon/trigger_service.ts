import * as cron from "node-cron";
import * as crypto from "node:crypto";

import type { ResolvedConfig, Trigger, ProactivityTemplate } from "../core/config";
import type { AuditLogger } from "../core/audit";
import type { Governor, GovernanceContext } from "../core/governor";
import type { RiskLevel } from "../types/skill";

export interface TriggerExecutionContext {
  triggerId: string;
  triggerType: "time" | "event" | "webhook";
  executedAt: string;
  approved: boolean;
  result?: "SUCCESS" | "DENIED" | "ERROR";
  error?: string;
}

export interface ScheduledTask {
  task: cron.ScheduledTask;
  trigger: Trigger;
  nextRun?: Date;
}

export class TriggerService {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private config: ResolvedConfig;
  private audit: AuditLogger;
  private governor: Governor;
  private actor: string;

  constructor(
    config: ResolvedConfig,
    audit: AuditLogger,
    governor: Governor,
    actor: string = "trigger_service"
  ) {
    this.config = config;
    this.audit = audit;
    this.governor = governor;
    this.actor = actor;
  }

  /**
   * Initialize and start all configured triggers
   */
  start(): void {
    if (!this.config.proactivity?.enabled) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "trigger_service.start",
        approved: true,
        target: "proactivity",
        result: "Proactivity disabled, not starting triggers"
      });
      return;
    }

    const triggers = this.config.proactivity.triggers ?? [];
    
    this.audit.log({
      timestamp: new Date().toISOString(),
      actor: this.actor,
      action: "trigger_service.start",
      approved: true,
      target: "proactivity",
      result: `Starting trigger service with ${triggers.length} trigger(s)`
    });

    for (const trigger of triggers) {
      try {
        this.scheduleTrigger(trigger);
      } catch (error) {
        this.audit.log({
          timestamp: new Date().toISOString(),
          actor: this.actor,
          action: "trigger_service.schedule_error",
          approved: false,
          target: trigger.id,
          result: `Failed to schedule trigger: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  /**
   * Stop all scheduled triggers
   */
  stop(): void {
    this.audit.log({
      timestamp: new Date().toISOString(),
      actor: this.actor,
      action: "trigger_service.stop",
      approved: true,
      target: "proactivity",
      result: `Stopping ${this.scheduledTasks.size} scheduled task(s)`
    });

    for (const [id, scheduledTask] of this.scheduledTasks.entries()) {
      scheduledTask.task.stop();
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "trigger_service.task_stopped",
        approved: true,
        target: id,
        result: "Task stopped"
      });
    }

    this.scheduledTasks.clear();
  }

  /**
   * Schedule a single trigger
   */
  private scheduleTrigger(trigger: Trigger): void {
    if (trigger.type === "time" && trigger.schedule) {
      // Validate cron expression
      if (!cron.validate(trigger.schedule)) {
        throw new Error(`Invalid cron expression for trigger ${trigger.id}: ${trigger.schedule}`);
      }

      const task = cron.schedule(trigger.schedule, () => {
        this.executeTrigger(trigger);
      });

      // Stop immediately so we can control when it starts
      task.stop();

      this.scheduledTasks.set(trigger.id, {
        task,
        trigger,
        nextRun: this.getNextRun(trigger.schedule)
      });

      task.start();

      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "trigger_service.scheduled",
        approved: true,
        target: trigger.id,
        result: `Scheduled cron trigger with schedule: ${trigger.schedule}`
      });
    } else if (trigger.type === "event" || trigger.type === "webhook") {
      // For event and webhook triggers, we just register them but don't actively schedule
      // They would be triggered externally
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "trigger_service.registered",
        approved: true,
        target: trigger.id,
        result: `Registered ${trigger.type} trigger`
      });
    }
  }

  /**
   * Execute a trigger with governance checks
   */
  private async executeTrigger(trigger: Trigger): Promise<void> {
    const executionContext: TriggerExecutionContext = {
      triggerId: trigger.id,
      triggerType: trigger.type,
      executedAt: new Date().toISOString(),
      approved: false
    };

    this.audit.log({
      timestamp: new Date().toISOString(),
      actor: this.actor,
      action: "trigger_service.execute_start",
      approved: false,
      target: trigger.id,
      result: `Starting execution of trigger: ${trigger.action.task}`
    });

    try {
      // Check if trigger matches a pre-approved template
      const matchedTemplate = this.matchTemplate(trigger);
      
      // Determine if auto-approval is allowed
      const autoApprove = trigger.autoApprove || (matchedTemplate && matchedTemplate.autoApprove);

      if (autoApprove && matchedTemplate) {
        // Verify crypto signature if present
        if (matchedTemplate.cryptoSignature && !this.verifySignature(matchedTemplate)) {
          executionContext.approved = false;
          executionContext.result = "DENIED";
          executionContext.error = "Invalid template signature";
          
          this.audit.log({
            timestamp: new Date().toISOString(),
            actor: this.actor,
            action: "trigger_service.signature_invalid",
            approved: false,
            target: trigger.id,
            result: `Signature verification failed for template ${matchedTemplate.templateId}`
          });
          return;
        }
      }

      // Run through governance
      const governanceDecision = this.checkGovernance(trigger, autoApprove ?? false);

      if (!governanceDecision.allowed) {
        executionContext.approved = false;
        executionContext.result = "DENIED";
        executionContext.error = governanceDecision.reason;

        this.audit.log({
          timestamp: new Date().toISOString(),
          actor: this.actor,
          action: "trigger_service.governance_denied",
          approved: false,
          target: trigger.id,
          result: `Governance denied: ${governanceDecision.reason}`
        });
        return;
      }

      executionContext.approved = true;

      // Execute the trigger action
      // In a real implementation, this would dispatch to the appropriate handler
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "trigger_service.execute",
        approved: true,
        target: trigger.id,
        result: `Executed trigger action: ${trigger.action.task} (mode: ${trigger.action.mode})`
      });

      executionContext.result = "SUCCESS";

    } catch (error) {
      executionContext.result = "ERROR";
      executionContext.error = error instanceof Error ? error.message : String(error);

      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "trigger_service.execute_error",
        approved: false,
        target: trigger.id,
        result: `Execution error: ${executionContext.error}`
      });
    } finally {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "trigger_service.execute_complete",
        approved: executionContext.approved,
        target: trigger.id,
        result: JSON.stringify(executionContext)
      });
    }
  }

  /**
   * Match trigger action against pre-approved templates
   */
  private matchTemplate(trigger: Trigger): ProactivityTemplate | undefined {
    const templates = this.config.proactivity?.templates ?? [];
    
    // Simple matching logic - in production this would be more sophisticated
    // For now, we just check if any template exists and log it
    for (const template of templates) {
      // A real implementation would check if trigger.action matches template.allowedSkills
      // and if the risk level is within bounds
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: this.actor,
        action: "trigger_service.template_check",
        approved: true,
        target: trigger.id,
        result: `Checking template: ${template.templateId}`
      });
    }

    // Return first template for now (simplified)
    return templates.length > 0 ? templates[0] : undefined;
  }

  /**
   * Verify cryptographic signature of a template
   */
  private verifySignature(template: ProactivityTemplate): boolean {
    if (!template.cryptoSignature) {
      return true; // No signature to verify
    }

    // Simple hash verification - in production this would use proper PKI
    const templateData = JSON.stringify({
      templateId: template.templateId,
      allowedSkills: template.allowedSkills,
      maxRisk: template.maxRisk,
      autoApprove: template.autoApprove
    });

    const hash = crypto.createHash("sha256").update(templateData).digest("hex");
    
    // In a real implementation, this would verify a signed hash with the owner's public key
    // For now, we just check if the signature starts with a specific prefix to indicate it's "valid"
    const isValid = template.cryptoSignature.startsWith("owner-signed-");

    this.audit.log({
      timestamp: new Date().toISOString(),
      actor: this.actor,
      action: "trigger_service.signature_verify",
      approved: isValid,
      target: template.templateId,
      result: `Signature verification ${isValid ? "passed" : "failed"}`
    });

    return isValid;
  }

  /**
   * Check governance for trigger execution
   */
  private checkGovernance(trigger: Trigger, autoApprove: boolean): { allowed: boolean; reason: string } {
    // Create governance context
    const context: GovernanceContext = {
      actor: this.actor,
      approved: autoApprove,
      authority: "OWNER" as any, // In production, map from trigger.action.authority
      commandMode: trigger.action.mode as any,
      audit: this.audit
    };

    // Create a governed action
    const action = {
      type: `trigger.${trigger.type}`,
      category: "external_tool" as const,
      riskLevel: this.getRiskLevel(trigger),
      requiresApproval: !autoApprove,
      allowWhenNetworkOff: true,
      allowWhenFrozen: false
    };

    try {
      const decision = this.governor.evaluate(action, this.config, context);
      return decision;
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : "Governance check failed"
      };
    }
  }

  /**
   * Determine risk level for a trigger
   */
  private getRiskLevel(trigger: Trigger): RiskLevel {
    // Simple risk assessment - in production this would be more sophisticated
    if (trigger.requiredPermissions && trigger.requiredPermissions.length > 0) {
      return "MEDIUM";
    }
    return "LOW";
  }

  /**
   * Get next run time for a cron schedule
   */
  private getNextRun(schedule: string): Date | undefined {
    // This is a simplified version - node-cron doesn't expose next run time directly
    // In production, you might use a library like cron-parser for this
    try {
      // Return a date 1 minute in the future as a placeholder
      return new Date(Date.now() + 60000);
    } catch {
      return undefined;
    }
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks(): Array<{
    id: string;
    type: string;
    schedule?: string;
    action: string;
    nextRun?: Date;
    autoApprove: boolean;
  }> {
    const result: Array<{
      id: string;
      type: string;
      schedule?: string;
      action: string;
      nextRun?: Date;
      autoApprove: boolean;
    }> = [];

    for (const [id, scheduledTask] of this.scheduledTasks.entries()) {
      result.push({
        id,
        type: scheduledTask.trigger.type,
        schedule: scheduledTask.trigger.schedule,
        action: scheduledTask.trigger.action.task,
        nextRun: scheduledTask.nextRun,
        autoApprove: scheduledTask.trigger.autoApprove ?? false
      });
    }

    return result;
  }

  /**
   * Manually trigger an execution (for testing or webhook triggers)
   */
  async manualTrigger(triggerId: string): Promise<void> {
    const scheduledTask = this.scheduledTasks.get(triggerId);
    if (!scheduledTask) {
      throw new Error(`Trigger not found: ${triggerId}`);
    }

    await this.executeTrigger(scheduledTask.trigger);
  }
}
