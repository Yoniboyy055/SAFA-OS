import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { assertAllowlistedPath, writeMemoryEntry } from "../../core/memory_vault";

interface RequestRecommendationInput {
  recipientName: string;
  relationship: string;
  outcome?: string;
}

interface RequestRecommendationOutput {
  artifactId: string;
  artifactPath: string;
  plan: Record<string, unknown>;
  risks: string[];
  estimated_cost: number;
}

export const requestRecommendationRequestSkill: SkillDefinition<
  RequestRecommendationInput,
  RequestRecommendationOutput
> = {
  name: "request_recommendation_request",
  description: "Generate a recommendation request outline (no execution).",
  inputSchema: {
    type: "object",
    required: ["recipientName", "relationship"],
    properties: {
      recipientName: { type: "string", description: "Recipient name." },
      relationship: { type: "string", description: "Relationship context." },
      outcome: { type: "string", description: "Desired outcome." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "request_recommendation_request",
    target: () => "data/memory/artifacts"
  },
  handler: (input, context) => {
    const nameRedaction = redactSensitiveText(input.recipientName, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const relationshipRedaction = redactSensitiveText(input.relationship, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan = {
      recipientName: nameRedaction.redactedText,
      relationship: relationshipRedaction.redactedText,
      outcome: input.outcome ?? "recommendation",
      talkingPoints: [
        "Recall shared work",
        "State the request clearly",
        "Make it easy to respond",
        "Offer supporting details"
      ]
    };
    const artifactPayload = {
      type: "recommendation_request",
      plan,
      risks: ["Confirm recipient and intent before sending."],
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
      title: `recommendation_${nameRedaction.redactedText}`,
      content: artifactJson,
      tags: ["recommendation"]
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
