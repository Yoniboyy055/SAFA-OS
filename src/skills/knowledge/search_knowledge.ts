import * as fs from "node:fs";
import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";

interface SearchKnowledgeInput {
  query: string;
  path?: string;
  maxResults?: number;
  maxFileSizeBytes?: number;
}

interface SearchKnowledgeOutput {
  matches: Array<{ file: string; line: number; preview: string }>;
  truncated: boolean;
  filesSearched: number;
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

export const searchKnowledgeSkill: SkillDefinition<
  SearchKnowledgeInput,
  SearchKnowledgeOutput
> = {
  name: "search_knowledge",
  description: "Search text inside knowledge vault documents.",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Search query." },
      path: { type: "string", description: "Subpath under knowledge/." },
      maxResults: { type: "number", description: "Maximum matches." },
      maxFileSizeBytes: {
        type: "number",
        description: "Skip files larger than this size."
      }
    }
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "search_knowledge",
    target: (input) => input.path ?? "knowledge/"
  },
  handler: (input, context) => {
    if (!input.query || typeof input.query !== "string") {
      throw new Error("query is required.");
    }
    const base = resolveKnowledgePath(context.config.rootDir, input.path);
    const maxResults = input.maxResults ?? 200;
    const maxFileSizeBytes = input.maxFileSizeBytes ?? 1024 * 1024;
    const matches: Array<{ file: string; line: number; preview: string }> = [];
    let truncated = false;
    let filesSearched = 0;

    const walk = (current: string): void => {
      if (matches.length >= maxResults) {
        truncated = true;
        return;
      }
      const stats = fs.statSync(current);
      if (stats.isFile()) {
        if (stats.size > maxFileSizeBytes) {
          return;
        }
        filesSearched += 1;
        const content = fs.readFileSync(current, "utf8");
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          if (lines[index].includes(input.query)) {
            matches.push({
              file: path.relative(context.config.rootDir, current),
              line: index + 1,
              preview: lines[index].slice(0, 200)
            });
            if (matches.length >= maxResults) {
              truncated = true;
              return;
            }
          }
        }
        return;
      }
      if (!stats.isDirectory()) {
        return;
      }
      const dirEntries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (matches.length >= maxResults) {
          truncated = true;
          return;
        }
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          walk(fullPath);
        }
      }
    };

    walk(base);
    return { matches, truncated, filesSearched };
  }
};
