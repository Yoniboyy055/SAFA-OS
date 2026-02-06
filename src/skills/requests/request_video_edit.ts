import * as path from "node:path";
import * as crypto from "node:crypto";

import type { SkillDefinition } from "../../types/skill";
import { redactSensitiveText } from "../../core/sensitive";
import {
  assertAllowlistedPath,
  writeMemoryEntry
} from "../../core/memory_vault";

interface RequestVideoEditInput {
  inputPath: string;
  outputPath: string;
  actions?: string[];
}

interface RequestVideoEditOutput {
  artifactId: string;
  artifactPath: string;
  plan: Record<string, unknown>;
  risks: string[];
  estimated_cost: number;
}

export const requestVideoEditSkill: SkillDefinition<
  RequestVideoEditInput,
  RequestVideoEditOutput
> = {
  name: "request_video_edit",
  description: "Generate an FFmpeg edit plan (no execution).",
  inputSchema: {
    type: "object",
    required: ["inputPath", "outputPath"],
    properties: {
      inputPath: { type: "string", description: "Source video path." },
      outputPath: { type: "string", description: "Output video path." },
      actions: { type: "array", description: "Edit actions (trim, crop, etc)." }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "request_video_edit",
    target: () => "data/memory/artifacts"
  },
  handler: (input, context) => {
    const actions = Array.isArray(input.actions) ? input.actions : ["trim"];
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
      actions,
      command: `ffmpeg -i "${inputRedaction.redactedText}" -vf "scale=1280:-1" "${outputRedaction.redactedText}"`
    };
    const artifactPayload = {
      type: "video_edit",
      plan,
      risks: ["FFmpeg commands must be reviewed before running."],
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
      title: "video_edit_plan",
      content: artifactJson,
      tags: ["video_edit"]
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
