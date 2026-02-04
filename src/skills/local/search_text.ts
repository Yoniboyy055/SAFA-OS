const fs = require("fs");
const path = require("path");

import type { SkillDefinition } from "../../types/skill";

interface SearchTextInput {
  path: string;
  query: string;
  caseSensitive?: boolean;
  recursive?: boolean;
  maxResults?: number;
  maxFileSizeBytes?: number;
  fileExtensions?: string[];
}

interface SearchMatch {
  file: string;
  line: number;
  preview: string;
}

interface SearchTextOutput {
  matches: SearchMatch[];
  truncated: boolean;
  filesSearched: number;
}

function resolvePath(inputPath: string, rootDir: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("Input path is required.");
  }
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(rootDir, inputPath);
}

function normalizeExtensions(extensions?: string[]): string[] | undefined {
  if (!extensions || extensions.length === 0) {
    return undefined;
  }
  return extensions
    .filter((ext) => typeof ext === "string")
    .map((ext) => (ext.startsWith(".") ? ext : `.${ext}`));
}

export const searchTextSkill: SkillDefinition<SearchTextInput, SearchTextOutput> =
  {
    name: "search_text",
    description: "Search for text in local files.",
    inputSchema: {
      type: "object",
      required: ["path", "query"],
      properties: {
        path: { type: "string", description: "Path to search." },
        query: { type: "string", description: "Text to search for." },
        caseSensitive: {
          type: "boolean",
          description: "Case-sensitive search."
        },
        recursive: { type: "boolean", description: "Recurse into folders." },
        maxResults: { type: "number", description: "Maximum matches." },
        maxFileSizeBytes: {
          type: "number",
          description: "Skip files larger than this size."
        },
        fileExtensions: {
          type: "array",
          description: "Limit search to file extensions."
        }
      }
    },
    riskLevel: "LOW",
    requiresApproval: false,
    allowWhenNetworkOff: true,
    category: "local",
    auditTemplate: {
      action: "search_text",
      target: (input) => input.path
    },
    handler: (input, context) => {
      const resolvedPath = resolvePath(input.path, context.config.rootDir);
      if (!input.query || typeof input.query !== "string") {
        throw new Error("Query is required.");
      }
      const caseSensitive = input.caseSensitive ?? false;
      const recursive = input.recursive ?? false;
      const maxResults = input.maxResults ?? 200;
      const maxFileSizeBytes = input.maxFileSizeBytes ?? 1024 * 1024;
      const extensions = normalizeExtensions(input.fileExtensions);
      const matches: SearchMatch[] = [];
      let truncated = false;
      let filesSearched = 0;

      const needle = caseSensitive ? input.query : input.query.toLowerCase();

      const searchFile = (filePath: string): void => {
        const stats = fs.statSync(filePath);
        if (!stats.isFile() || stats.size > maxFileSizeBytes) {
          return;
        }
        if (extensions && !extensions.some((ext) => filePath.endsWith(ext))) {
          return;
        }
        filesSearched += 1;
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const haystack = caseSensitive ? line : line.toLowerCase();
          if (haystack.includes(needle)) {
            matches.push({
              file: filePath,
              line: index + 1,
              preview: line.slice(0, 200)
            });
            if (matches.length >= maxResults) {
              truncated = true;
              return;
            }
          }
        }
      };

      const walk = (currentPath: string): void => {
        if (matches.length >= maxResults) {
          truncated = true;
          return;
        }
        const stats = fs.statSync(currentPath);
        if (stats.isFile()) {
          searchFile(currentPath);
          return;
        }
        if (!stats.isDirectory()) {
          return;
        }
        const dirEntries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of dirEntries) {
          if (matches.length >= maxResults) {
            truncated = true;
            return;
          }
          const fullPath = path.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            if (recursive) {
              walk(fullPath);
            }
          } else if (entry.isFile()) {
            searchFile(fullPath);
          }
        }
      };

      walk(resolvedPath);
      return { matches, truncated, filesSearched };
    }
  };
