import * as fs from "node:fs";
import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";

interface ListKnowledgeInput {
  path?: string;
  recursive?: boolean;
  maxEntries?: number;
}

interface ListKnowledgeOutput {
  entries: string[];
  truncated: boolean;
}

function resolveKnowledgePath(rootDir: string, inputPath?: string): string {
  const baseDir = path.join(rootDir, "knowledge");
  const resolved = inputPath
    ? path.resolve(baseDir, inputPath)
    : baseDir;
  const relative = path.relative(baseDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path must stay within knowledge/.");
  }
  return resolved;
}

export const listKnowledgeSkill: SkillDefinition<
  ListKnowledgeInput,
  ListKnowledgeOutput
> = {
  name: "list_knowledge",
  description: "List documents in the local knowledge vault.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Subpath under knowledge/." },
      recursive: { type: "boolean", description: "Recurse into subfolders." },
      maxEntries: { type: "number", description: "Maximum entries." }
    }
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "list_knowledge",
    target: (input) => input.path ?? "knowledge/"
  },
  handler: (input, context) => {
    const target = resolveKnowledgePath(context.config.rootDir, input.path);
    const recursive = input.recursive ?? true;
    const maxEntries = input.maxEntries ?? 200;
    const entries: string[] = [];
    let truncated = false;

    const walk = (current: string): void => {
      if (entries.length >= maxEntries) {
        truncated = true;
        return;
      }
      const stats = fs.statSync(current);
      if (stats.isFile()) {
        entries.push(path.relative(context.config.rootDir, current));
        return;
      }
      if (!stats.isDirectory()) {
        return;
      }
      const dirEntries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (entries.length >= maxEntries) {
          truncated = true;
          return;
        }
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (recursive) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          entries.push(path.relative(context.config.rootDir, fullPath));
        }
      }
    };

    walk(target);
    return { entries, truncated };
  }
};
