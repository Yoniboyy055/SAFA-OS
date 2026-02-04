import type { ResolvedConfig } from "./config";
import type { PlanOutput, PlanStep } from "../types/plan";
import type { RiskLevel, SkillDefinition, SkillInputSchema } from "../types/skill";
import { SkillRegistry } from "../skills/registry";

export interface ReviewedStep {
  id: string;
  description: string;
  suggestedSkill: string;
  input: Record<string, unknown>;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  validationErrors: string[];
}

export interface PlanReviewResult {
  plan: PlanOutput;
  steps: ReviewedStep[];
  valid: boolean;
  approvalRequired: boolean;
  approved: boolean;
  reason?: string;
}

function validateInputSchema(
  input: Record<string, unknown>,
  schema: SkillInputSchema
): string[] {
  const errors: string[] = [];
  if (schema.type !== "object") {
    return errors;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    errors.push("Input must be an object.");
    return errors;
  }
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in input)) {
        errors.push(`Missing required input: ${key}`);
      }
    }
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in input)) {
      continue;
    }
    const value = input[key];
    if (property.type === "array") {
      if (!Array.isArray(value)) {
        errors.push(`Expected ${key} to be an array.`);
      }
      continue;
    }
    if (property.type === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`Expected ${key} to be an object.`);
      }
      continue;
    }
    if (typeof value !== property.type) {
      errors.push(`Expected ${key} to be ${property.type}.`);
    }
  }
  return errors;
}

function deriveRisk(
  step: PlanStep,
  skill?: SkillDefinition
): { riskLevel: RiskLevel; requiresApproval: boolean } {
  if (skill) {
    const requiresApproval = skill.requiresApproval || skill.riskLevel !== "LOW";
    return {
      riskLevel: skill.riskLevel,
      requiresApproval
    };
  }
  return {
    riskLevel: step.riskLevel,
    requiresApproval: step.requiresApproval
  };
}

export class Manager {
  private readonly registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  reviewPlan(
    plan: PlanOutput,
    config: ResolvedConfig,
    approved: boolean
  ): PlanReviewResult {
    const steps: ReviewedStep[] = [];
    let valid = true;
    let approvalRequired = false;

    for (const step of plan.steps) {
      const errors: string[] = [];
      const skill = this.registry.get(step.suggested_skill);
      if (!skill) {
        errors.push(`Unknown skill: ${step.suggested_skill}`);
      }
      if (skill) {
        const schemaErrors = validateInputSchema(
          step.input_example ?? {},
          skill.inputSchema
        );
        errors.push(...schemaErrors);
      }

      const derived = deriveRisk(step, skill);
      let requiresApproval = derived.requiresApproval;
      if (config.governance.strictApprovalMode) {
        requiresApproval = true;
      }
      approvalRequired = approvalRequired || requiresApproval;

      if (errors.length > 0) {
        valid = false;
      }

      steps.push({
        id: step.id,
        description: step.description,
        suggestedSkill: step.suggested_skill,
        input: step.input_example ?? {},
        riskLevel: derived.riskLevel,
        requiresApproval,
        validationErrors: errors
      });
    }

    let reason: string | undefined;
    if (!valid) {
      reason = "Plan validation failed.";
    } else if (approvalRequired && !approved) {
      reason = "Approval required to execute plan steps.";
    }

    return {
      plan,
      steps,
      valid,
      approvalRequired,
      approved,
      reason
    };
  }
}
