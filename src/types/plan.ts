import type { RiskLevel } from "./skill";

export interface PlanStep {
  id: string;
  description: string;
  suggested_skill: string;
  input_example: Record<string, unknown>;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export interface PlanStressTest {
  failure_mode: string;
  mitigation: string;
}

export interface PlanOutput {
  task: string;
  steps: PlanStep[];
  stress_tests: PlanStressTest[];
  assumptions: string[];
}
