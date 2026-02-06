import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import {
  assertAllowlistedPath,
  writeMemoryEntry
} from "../../core/memory_vault";

interface RequestImageEditInput {
  inputPath: string;
  outputPath: string;
  operations?: string[];
}

interface RequestImageEditOutput {
  artifactId: string;
  artifactPath: string;
  plan: Record<string, unknown>;
  risks: string[];
  estimated_cost: number;
}

export const requestImageEditSkill: SkillDefinition<
  RequestImageEditInput,
  RequestImageEditOutput
> = {
  name: "request_image_edit",
  description: "Generate an ImageMagick edit plan (no execution).",
  inputSchema: {
    type: "object",
    required: ["inputPath", "outputPath"],
    properties: {
      inputPath: { type: "string", description: "Source image path." },
      outputPath: { type: "string", description: "Output image path." },
      operations: { type: "array", description: "Edit operations." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "request_image_edit",
    target: () => "data/memory/artifacts"
  },
  handler: (input, context) => {
    const operations = Array.isArray(input.operations)
      ? input.operations
      : ["resize"];
    const inputRedaction = redactSensitiveText(input.inputPath, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const outputRedaction = redactSensitiveText(input.outputPath, {
      allowPii: false,
      redactKeys: context.config.audit.redactKeys
    });
    const plan = {
      inputPath: inputRedaction.redactedText,
      outputPath: outputRedaction.redactedText,
      operations,
      command: `magick "${inputRedaction.redactedText}" -resize 1024x1024 "${outputRedaction.redactedText}"`
    };
    const artifactPayload = {
      type: "image_edit",
      plan,
      risks: ["ImageMagick commands must be reviewed before running."],
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
      title: "image_edit_plan",
      content: artifactJson,
      tags: ["image_edit"]
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
