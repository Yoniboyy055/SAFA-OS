const fs = require("fs");
const path = require("path");

import type { SkillDefinition } from "../../types/skill";

interface WriteFileInput {
  path: string;
  content: string;
  encoding?: string;
  overwrite?: boolean;
  createDirs?: boolean;
}

interface WriteFileOutput {
  path: string;
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

function isPathAllowed(targetPath: string, allowlist: string[]): boolean {
  const normalized = path.resolve(targetPath);
  return allowlist.some((root) => {
    const resolvedRoot = path.resolve(root);
    return normalized === resolvedRoot || normalized.startsWith(resolvedRoot + path.sep);
  });
}

export const writeFileSkill: SkillDefinition<WriteFileInput, WriteFileOutput> = {
  name: "write_file",
  description: "Write a local file to disk (restricted by allowlist).",
  inputSchema: {
    type: "object",
    required: ["path", "content"],
    properties: {
      path: { type: "string", description: "File path to write." },
      content: { type: "string", description: "Content to write." },
      encoding: { type: "string", description: "Text encoding, default utf8." },
      overwrite: {
        type: "boolean",
        description: "Allow overwriting existing files."
      },
      createDirs: {
        type: "boolean",
        description: "Create parent directories when missing."
      }
    }
  },
  riskLevel: "HIGH",
  requiresApproval: true,
  allowWhenNetworkOff: true,
  category: "local",
  auditTemplate: {
    action: "write_file",
    target: (input) => input.path
  },
  handler: (input, context) => {
    const resolvedPath = resolvePath(input.path, context.config.rootDir);
    if (typeof input.content !== "string") {
      throw new Error("Content must be a string.");
    }
    if (!isPathAllowed(resolvedPath, context.config.permissions.writeAllowlist)) {
      throw new Error("Write path is not allowlisted.");
    }
    const encoding = input.encoding ?? "utf8";
    const overwrite = input.overwrite ?? false;
    const createDirs = input.createDirs ?? false;

    if (fs.existsSync(resolvedPath) && !overwrite) {
      throw new Error("Target file exists. Set overwrite to true to replace.");
    }

    if (createDirs) {
      const dir = path.dirname(resolvedPath);
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, input.content, { encoding });
    return {
      path: resolvedPath,
      bytes: fs.statSync(resolvedPath).size
    };
  }
};
