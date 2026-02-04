const fs = require("fs");
const path = require("path");

import type { SkillDefinition } from "../../types/skill";

interface ReadFileInput {
  path: string;
  encoding?: string;
}

interface ReadFileOutput {
  path: string;
  content: string;
  bytes: number;
}

function resolvePath(inputPath: string, rootDir: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("Input path is required.");
  }
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(rootDir, inputPath);
}

export const readFileSkill: SkillDefinition<ReadFileInput, ReadFileOutput> = {
  name: "read_file",
  description: "Read a local file from disk.",
  inputSchema: {
    type: "object",
    required: ["path"],
    properties: {
      path: { type: "string", description: "File path to read." },
      encoding: { type: "string", description: "Text encoding, default utf8." }
    }
  },
  riskLevel: "LOW",
  requiresApproval: false,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "read_file",
    target: (input) => input.path
  },
  handler: (input, context) => {
    const resolvedPath = resolvePath(input.path, context.config.rootDir);
    const encoding = input.encoding ?? "utf8";
    const content = fs.readFileSync(resolvedPath, { encoding });
    const stats = fs.statSync(resolvedPath);
    return {
      path: resolvedPath,
      content,
      bytes: stats.size
    };
  }
};
