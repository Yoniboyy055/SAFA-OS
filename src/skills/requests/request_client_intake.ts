import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { assertAllowlistedPath, writeMemoryEntry } from "../../core/memory_vault";

interface RequestClientIntakeInput {
  clientName: string;
  summary: string;
  goals?: string[];
}

interface RequestClientIntakeOutput {
  artifactId: string;
  artifactPath: string;
  plan: Record<string, unknown>;
  risks: string[];
  estimated_cost: number;
}

export const requestClientIntakeSkill: SkillDefinition<
  RequestClientIntakeInput,
  RequestClientIntakeOutput
> = {
  name: "request_client_intake",
  description: "Draft a client intake plan (no execution).",
  inputSchema: {
    type: "object",
    required: ["clientName", "summary"],
    properties: {
      clientName: { type: "string", description: "Client name." },
      summary: { type: "string", description: "Client summary." },
      goals: { type: "array", description: "Goals list." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "request_client_intake",
    target: () => "data/memory/artifacts"
  },
  handler: (input, context) => {
    const goals = Array.isArray(input.goals) ? input.goals : [];
    const nameRedaction = redactSensitiveText(input.clientName, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const summaryRedaction = redactSensitiveText(input.summary, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan = {
      clientName: nameRedaction.redactedText,
      summary: summaryRedaction.redactedText,
      goals,
      steps: [
        "Collect requirements",
        "Confirm scope and timeline",
        "Prepare draft proposal",
        "Review with owner for approval"
      ]
    };
    const artifactPayload = {
      type: "client_intake",
      plan,
      risks: ["Requires owner approval before contacting client."],
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
      title: `client_intake_${nameRedaction.redactedText}`,
      content: artifactJson,
      tags: ["client_intake"]
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
