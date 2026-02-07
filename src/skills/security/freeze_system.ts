import type { SkillDefinition } from "../../types/skill";
import { enableFreeze } from "../../core/freeze";

interface FreezeInput {
  reason?: string;
}

interface FreezeOutput {
  enabled: boolean;
  reason?: string;
  actor?: string;
  at?: string;
}

export const freezeSystemSkill: SkillDefinition<FreezeInput, FreezeOutput> = {
  name: "freeze_system",
  description: "Immediately halt tasks and automation (one-button freeze).",
  inputSchema: {
    type: "object",
    required: [],
    properties: {
      reason: { type: "string", description: "Reason for freeze." }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "freeze_system",
    target: () => "system"
  },
  handler: (input, context) => {
    const result = enableFreeze(
      context.config.rootDir,
      context.actor,
      typeof input.reason === "string" ? input.reason : undefined
    );
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "freeze.enabled",
      approved: context.approved,
      target: "system",
      result: JSON.stringify(result)
    });
    return result;
  }
};
