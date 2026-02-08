import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { assertAllowlistedPath, writeMemoryEntry } from "../../core/memory_vault";

interface RequestNegotiationScriptInput {
  clientName?: string;
  offerSummary?: string;
  concessions?: string[];
  counterpart?: string;
  objective?: string;
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
  description: "Generate a negotiation script outline (no execution).",
  inputSchema: {
    type: "object",
    properties: {
      clientName: { type: "string", description: "Client name." },
      offerSummary: { type: "string", description: "Offer summary." },
      concessions: { type: "array", description: "Concession options." },
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
    const concessions = Array.isArray(input.concessions)
      ? input.concessions
      : Array.isArray(input.constraints)
        ? input.constraints
        : [];
    const clientName =
      typeof input.clientName === "string"
        ? input.clientName
        : typeof input.counterpart === "string"
          ? input.counterpart
          : "unknown";
    const offerSummary =
      typeof input.offerSummary === "string"
        ? input.offerSummary
        : typeof input.objective === "string"
          ? input.objective
          : "unspecified";
    const nameRedaction = redactSensitiveText(clientName, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const offerRedaction = redactSensitiveText(offerSummary, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan: Record<string, unknown> = {
      clientName: nameRedaction.redactedText,
      offerSummary: offerRedaction.redactedText,
      concessions,
      scriptBeats: [
        "Opening value statement",
        "Confirm objectives",
        "Present offer",
        "Handle objections",
        "Summarize and next steps"
      ],
      script: [
        "Open with context and shared goals.",
        "Present key terms and value.",
        "Address constraints and alternatives.",
        "Close with next steps and approvals."
      ]
    };

    if (Array.isArray(input.constraints)) {
      plan.constraints = input.constraints;
    }

    const artifactPayload = {
      type: "negotiation_script",
      plan,
      risks: ["Review tone and concessions before sending."],
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
      title: `negotiation_${nameRedaction.redactedText}`,
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
