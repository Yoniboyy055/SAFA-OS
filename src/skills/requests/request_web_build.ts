import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import {
  assertAllowlistedPath,
  writeMemoryEntry
} from "../../core/memory_vault";

interface RequestWebBuildInput {
  projectName: string;
  description: string;
  stack?: string[];
}

interface RequestWebBuildOutput {
  artifactId: string;
  artifactPath: string;
  plan: Record<string, unknown>;
  risks: string[];
  estimated_cost: number;
}

export const requestWebBuildSkill: SkillDefinition<
  RequestWebBuildInput,
  RequestWebBuildOutput
> = {
  name: "request_web_build",
  description: "Generate a web build plan and file tree (no execution).",
  inputSchema: {
    type: "object",
    required: ["projectName", "description"],
    properties: {
      projectName: { type: "string", description: "Project name." },
      description: { type: "string", description: "Project description." },
      stack: { type: "array", description: "Preferred stack items." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "request_web_build",
    target: () => "data/memory/artifacts"
  },
  handler: (input, context) => {
    const stack = Array.isArray(input.stack) ? input.stack : ["node", "ts"];
    const nameRedaction = redactSensitiveText(input.projectName, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const descRedaction = redactSensitiveText(input.description, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan = {
      projectName: nameRedaction.redactedText,
      description: descRedaction.redactedText,
      stack,
      steps: [
        "Scaffold project structure",
        "Add config files",
        "Generate initial components",
        "Review and approve before execution"
      ],
      fileTree: [
        "README.md",
        "package.json",
        "src/",
        "src/index.ts",
        "tests/"
      ],
      commands: ["npm install", "npm run build"]
    };
    const artifactPayload = {
      type: "web_build",
      plan,
      risks: ["Requires human review before running commands."],
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
      title: `web_build_${nameRedaction.redactedText}`,
      content: artifactJson,
      tags: ["web_build"]
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
