import type { SkillDefinition } from "../../types/skill";
import {
  assertAllowlistedPath,
  readMemoryEntry
} from "../../core/memory_vault";

interface MemoryGetInput {
  bucket: "canon" | "notes" | "artifacts";
  id: string;
}

interface MemoryGetOutput {
  id: string;
  bucket: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export const memoryGetSkill: SkillDefinition<MemoryGetInput, MemoryGetOutput> = {
  name: "memory_get",
  description: "Fetch a memory entry from data/memory.",
  inputSchema: {
    type: "object",
    required: ["bucket", "id"],
    properties: {
      bucket: { type: "string", description: "canon, notes, or artifacts." },
      id: { type: "string", description: "Entry id." }
    }
  },
  riskLevel: "MEDIUM",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "memory_get",
    target: (input) => `data/memory/${input.bucket}`
  },
  handler: (input, context) => {
    if (!input.id || typeof input.id !== "string") {
      throw new Error("id is required.");
    }
    const bucket = input.bucket;
    if (bucket !== "canon" && bucket !== "notes" && bucket !== "artifacts") {
      throw new Error("bucket must be canon, notes, or artifacts.");
    }
    const targetDir = `${context.config.rootDir}/data/memory/${bucket}`;
    assertAllowlistedPath(
      targetDir,
      context.config.permissions.readAllowlist,
      context.config.rootDir
    );
    const entry = readMemoryEntry(context.config.rootDir, bucket, input.id);
    return entry;
  }
};
