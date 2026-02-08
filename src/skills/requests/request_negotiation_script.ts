import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { assertAllowlistedPath, writeMemoryEntry } from "../../core/memory_vault";

interface RequestNegotiationScriptInput {
  counterpart: string;
  objective: string;
  constraints?: string[];
}

interface RequestNegotiationScriptOutput {
  artifactId: string;
  artifactPath: string;
  plan: Record<string, unknown>;
  risks: string[];
  estimated_cost: number;
}

export const requestNegotiationScriptSkill: SkillDefinition<
  RequestNegotiationScriptInput,
  RequestNegotiationScriptOutput
> = {
  name: "request_negotiation_script",
  description: "Draft a negotiation script (preview only).",
  inputSchema: {
    type: "object",
    required: ["counterpart", "objective"],
    properties: {
      counterpart: { type: "string", description: "Counterpart name." },
      objective: { type: "string", description: "Negotiation objective." },
      constraints: { type: "array", description: "Constraints or boundaries." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "request_negotiation_script",
    target: () => "data/memory/artifacts"
  },
  handler: (input, context) => {
    const constraints = Array.isArray(input.constraints) ? input.constraints : [];
    const counterpartRedaction = redactSensitiveText(input.counterpart, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const objectiveRedaction = redactSensitiveText(input.objective, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan = {
      counterpart: counterpartRedaction.redactedText,
      objective: objectiveRedaction.redactedText,
      constraints,
      script: [
        "Open with context and shared goals.",
        "Present key terms and value.",
        "Address constraints and alternatives.",
        "Close with next steps and approvals."
      ]
    };
    const artifactPayload = {
      type: "negotiation_script",
      plan,
      risks: ["Requires owner approval before any outreach."],
      estimated_cost: 0
    };
    const artifactJson = JSON.stringify(artifactPayload, null, 2);
    const id = crypto.createHash("sha256").update(artifactJson).digest("hex").slice(0, 12);
    const targetDir = path.join(context.config.rootDir, "data", "memory", "artifacts");
    assertAllowlistedPath(
      targetDir,
      context.config.permissions.writeAllowlist,
      context.config.rootDir
    );
    const { filePath } = writeMemoryEntry(context.config.rootDir, "artifacts", {
      id,
      title: `negotiation_${counterpartRedaction.redactedText}`,
      content: artifactJson,
      tags: ["negotiation"]
    });
    return {
      artifactId: id,
      artifactPath: filePath,
      plan,
      risks: artifactPayload.risks,
      estimated_cost: 0
    };
  }
};
