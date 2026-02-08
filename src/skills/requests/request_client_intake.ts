import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import { assertAllowlistedPath, writeMemoryEntry } from "../../core/memory_vault";

interface RequestClientIntakeInput {
  clientName: string;
  projectType?: string;
  summary?: string;
  goals?: string[];
  budgetRange?: string;
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
  description: "Generate a client intake plan (no execution).",
  inputSchema: {
    type: "object",
    required: ["clientName"],
    properties: {
      clientName: { type: "string", description: "Client name." },
      projectType: { type: "string", description: "Project type." },
      summary: { type: "string", description: "Client summary." },
      goals: { type: "array", description: "Primary goals." },
      budgetRange: { type: "string", description: "Budget range." }
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
    const projectType = typeof input.projectType === "string" ? input.projectType : "";
    const summary = typeof input.summary === "string" ? input.summary : "";
    const projectRedaction = projectType
      ? redactSensitiveText(projectType, {
          allowPii: false,
          redactKeys: context.config.audit.redactKeys
        })
      : null;
    const summaryRedaction = summary
      ? redactSensitiveText(summary, {
          allowPii: false,
          redactKeys: context.config.audit.redactKeys
        })
      : null;

    const plan: Record<string, unknown> = {
      clientName: nameRedaction.redactedText,
      goals,
      budgetRange: input.budgetRange ?? "unspecified",
      intakeChecklist: [
        "Stakeholder list",
        "Success criteria",
        "Timeline constraints",
        "Decision maker and approval flow"
      ],
      steps: [
        "Collect requirements",
        "Confirm scope and timeline",
        "Prepare draft proposal",
        "Review with owner for approval"
      ]
    };

    if (projectRedaction) {
      plan.projectType = projectRedaction.redactedText;
    }
    if (summaryRedaction) {
      plan.summary = summaryRedaction.redactedText;
    }

    const artifactPayload = {
      type: "client_intake",
      plan,
      risks: ["Human review required before sharing externally."],
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
