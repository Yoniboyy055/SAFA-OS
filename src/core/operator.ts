import type { ResolvedConfig } from "./config";
import type { PlanReviewResult, ReviewedStep } from "./manager";
import type { SkillExecutionResult } from "../types/skill";
import type { AuditLogger } from "./audit";
import type { Governor } from "./governor";
import { SkillRegistry } from "../skills/registry";

export interface StepExecutionResult {
  stepId: string;
  skill: string;
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface ExecutionSummary {
  results: StepExecutionResult[];
  success: boolean;
}

export interface OperatorContext {
  actor: string;
  approved: boolean;
  config: ResolvedConfig;
}

export class Operator {
  private readonly registry: SkillRegistry;
  private readonly audit: AuditLogger;
  private readonly governor: Governor;

  constructor(registry: SkillRegistry, audit: AuditLogger, governor: Governor) {
    this.registry = registry;
    this.audit = audit;
    this.governor = governor;
  }

  async executePlan(
    review: PlanReviewResult,
    context: OperatorContext
  ): Promise<ExecutionSummary> {
    if (!review.valid) {
      return { results: [], success: false };
    }
    if (review.approvalRequired && !context.approved) {
      return { results: [], success: false };
    }

    const results: StepExecutionResult[] = [];
    for (const step of review.steps) {
      const stepResult = await this.executeStep(step, context);
      results.push(stepResult);
    }

    return {
      results,
      success: results.every((result) => result.success)
    };
  }

  private async executeStep(
    step: ReviewedStep,
    context: OperatorContext
  ): Promise<StepExecutionResult> {
    const skill = this.registry.get(step.suggestedSkill);
    if (!skill) {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "operator.step",
        approved: context.approved,
        target: step.id,
        result: "ERROR: Unknown skill."
      });
      return {
        stepId: step.id,
        skill: step.suggestedSkill,
        success: false,
        error: "Unknown skill."
      };
    }

    if (skill.category !== "local") {
      this.audit.log({
        timestamp: new Date().toISOString(),
        actor: context.actor,
        action: "operator.step",
        approved: context.approved,
        target: step.id,
        result: "DENIED: Non-local skills are blocked."
      });
      return {
        stepId: step.id,
        skill: step.suggestedSkill,
        success: false,
        error: "Non-local skills are blocked."
      };
    }

    this.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "operator.step.start",
      approved: context.approved,
      target: step.id,
      result: `START ${skill.name}`
    });

    const result: SkillExecutionResult = await this.registry.execute(
      skill.name,
      step.input,
      {
        actor: context.actor,
        approved: context.approved,
        config: context.config,
        audit: this.audit,
        governor: this.governor
      }
    );

    this.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "operator.step.end",
      approved: context.approved,
      target: step.id,
      result: result.success ? "SUCCESS" : `ERROR: ${result.error ?? "Failed"}`
    });

    return {
      stepId: step.id,
      skill: skill.name,
      success: result.success,
      output: result.output,
      error: result.error
    };
  }
}
