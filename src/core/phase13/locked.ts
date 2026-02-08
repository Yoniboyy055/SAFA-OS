import type { SkillExecutionResult } from "../../types/skill";
import { buildRegistry } from "../../skills/registry_factory";
import type { SkillRunContext } from "../../skills/registry";
import { readFreezeState } from "../freeze";

interface ClientIntakeInput {
  clientName: string;
  projectType?: string;
  summary?: string;
  goals?: string[];
  budgetRange?: string;
}

interface NegotiationInput {
  clientName: string;
  scope?: string;
  leverage?: string;
  targetOutcome?: string;
}

interface FollowUpInput {
  clientName: string;
  context?: string;
  actionItems?: string[];
}

interface RecommendationInput {
  recipientName: string;
  relationship: string;
  outcome?: string;
}

function buildContext(context: SkillRunContext): SkillRunContext {
  const freezeEnabled = readFreezeState(context.config.rootDir).enabled;
  return { ...context, freezeEnabled };
}

export async function runClientIntake(
  input: ClientIntakeInput,
  context: SkillRunContext
): Promise<SkillExecutionResult> {
  const registry = buildRegistry();
  return registry.execute("request_client_intake", input, buildContext(context));
}

export async function runNegotiationFlow(
  input: NegotiationInput,
  context: SkillRunContext
): Promise<SkillExecutionResult> {
  const registry = buildRegistry();
  return registry.execute("request_negotiation_script", input, buildContext(context));
}

export async function runFollowUpFlow(
  input: FollowUpInput,
  context: SkillRunContext
): Promise<SkillExecutionResult> {
  const registry = buildRegistry();
  return registry.execute("request_follow_up", input, buildContext(context));
}

export async function runRecommendationRequest(
  input: RecommendationInput,
  context: SkillRunContext
): Promise<SkillExecutionResult> {
  const registry = buildRegistry();
  return registry.execute(
    "request_recommendation_request",
    input,
    buildContext(context)
  );
}

export function getPhase13LockMessage(): string {
  return "PHASE_13_ACTIVE";
}
