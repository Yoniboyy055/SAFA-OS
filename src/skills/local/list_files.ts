const fs = require("fs");
const path = require("path");

import type { SkillDefinition } from "../../types/skill";

interface ListFilesInput {
  path: string;
  recursive?: boolean;
  maxDepth?: number;
  includeDirectories?: boolean;
  maxEntries?: number;
}

interface ListFilesOutput {
  entries: Array<{ path: string; type: "file" | "directory" }>;
  truncated: boolean;
}

function resolvePath(inputPath: string, rootDir: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("Input path is required.");
  }
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(rootDir, inputPath);
}

export const listFilesSkill: SkillDefinition<ListFilesInput, ListFilesOutput> = {
  name: "list_files",
  description: "List files and directories within a local path.",
  inputSchema: {
    type: "object",
    required: ["path"],
    properties: {
      path: { type: "string", description: "Directory path to list." },
      recursive: { type: "boolean", description: "Recurse into subfolders." },
      maxDepth: { type: "number", description: "Maximum recursion depth." },
      includeDirectories: {
        type: "boolean",
        description: "Include directories in output."
      },
      maxEntries: { type: "number", description: "Maximum entries to return." }
    }
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "list_files",
    target: (input) => input.path
  },
  handler: (input, context) => {
    const resolvedPath = resolvePath(input.path, context.config.rootDir);
    const recursive = input.recursive ?? false;
    const maxDepth = input.maxDepth ?? 3;
    const includeDirectories = input.includeDirectories ?? false;
    const maxEntries = input.maxEntries ?? 1000;
    const entries: Array<{ path: string; type: "file" | "directory" }> = [];
    let truncated = false;

    const walk = (currentPath: string, depth: number): void => {
      if (entries.length >= maxEntries) {
        truncated = true;
        return;
      }
      const dirEntries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (entries.length >= maxEntries) {
          truncated = true;
          return;
        }
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          if (includeDirectories) {
            entries.push({ path: fullPath, type: "directory" });
          }
          if (recursive && depth < maxDepth) {
            walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          entries.push({ path: fullPath, type: "file" });
        }
      }
    };

    walk(resolvedPath, 0);
    return { entries, truncated };
  }
};
