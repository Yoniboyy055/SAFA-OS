import type { SkillDefinition } from "../../types/skill";
import { clearFreeze } from "../../core/freeze";

interface UnfreezeInput {
  reason?: string;
}

interface UnfreezeOutput {
  enabled: boolean;
  reason?: string;
  actor?: string;
  at?: string;
}

export const unfreezeSystemSkill: SkillDefinition<
  UnfreezeInput,
  UnfreezeOutput
> = {
  name: "unfreeze_system",
  description: "Lift the freeze state (requires explicit approval).",
  inputSchema: {
    type: "object",
    required: [],
    properties: {
      reason: { type: "string", description: "Reason for unfreeze." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "unfreeze_system",
    target: () => "system"
  },
  handler: (input, context) => {
    const result = clearFreeze(
      context.config.rootDir,
      context.actor,
      typeof input.reason === "string" ? input.reason : undefined
    );
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: "freeze.cleared",
      approved: context.approved,
      target: "system",
      result: JSON.stringify(result)
    });
    return result;
  }
};
