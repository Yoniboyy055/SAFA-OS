import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { assertAllowlistedPath, writeMemoryEntry } from "../../core/memory_vault";

interface RequestFollowUpInput {
  contactName?: string;
  context?: string;
  channel?: "email" | "call" | "message";
  recipient?: string;
  purpose?: string;
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
  description: "Generate a follow-up plan and draft outline (no execution).",
  inputSchema: {
    type: "object",
    properties: {
      contactName: { type: "string", description: "Contact name." },
      context: { type: "string", description: "Context for follow-up." },
      channel: { type: "string", description: "Preferred channel." },
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
    const contactName =
      typeof input.contactName === "string"
        ? input.contactName
        : typeof input.recipient === "string"
          ? input.recipient
          : "unknown";
    const followContext =
      typeof input.context === "string"
        ? input.context
        : typeof input.purpose === "string"
          ? input.purpose
          : "unspecified";
    const nameRedaction = redactSensitiveText(contactName, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const contextRedaction = redactSensitiveText(followContext, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan = {
      contactName: nameRedaction.redactedText,
      context: contextRedaction.redactedText,
      channel: input.channel ?? "email",
      lastContact: input.lastContact ?? "unspecified",
      steps: [
        "Summarize last interaction",
        "Confirm next action",
        "Propose follow-up time",
        "Request confirmation",
        "Request approval before sending"
      ]
    };
    const artifactPayload = {
      type: "follow_up",
      plan,
      risks: ["Confirm details before sending."],
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
      title: `follow_up_${nameRedaction.redactedText}`,
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
