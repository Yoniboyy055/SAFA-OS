import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { assertAllowlistedPath, writeMemoryEntry } from "../../core/memory_vault";

interface RequestFollowUpInput {
  recipient: string;
  purpose: string;
  lastContact?: string;
}

interface RequestFollowUpOutput {
  artifactId: string;
  artifactPath: string;
  plan: Record<string, unknown>;
  risks: string[];
  estimated_cost: number;
}

export const requestFollowUpSkill: SkillDefinition<
  RequestFollowUpInput,
  RequestFollowUpOutput
> = {
  name: "request_follow_up",
  description: "Draft a follow-up plan (preview only).",
  inputSchema: {
    type: "object",
    required: ["recipient", "purpose"],
    properties: {
      recipient: { type: "string", description: "Recipient name or role." },
      purpose: { type: "string", description: "Follow-up purpose." },
      lastContact: { type: "string", description: "Last contact date." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "request_follow_up",
    target: () => "data/memory/artifacts"
  },
  handler: (input, context) => {
    const recipientRedaction = redactSensitiveText(input.recipient, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const purposeRedaction = redactSensitiveText(input.purpose, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan = {
      recipient: recipientRedaction.redactedText,
      purpose: purposeRedaction.redactedText,
      lastContact: input.lastContact ?? "unspecified",
      steps: [
        "Draft a concise follow-up note",
        "Confirm next steps internally",
        "Request approval before sending"
      ]
    };
    const artifactPayload = {
      type: "follow_up",
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
      title: `follow_up_${recipientRedaction.redactedText}`,
      content: artifactJson,
      tags: ["follow_up"]
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
