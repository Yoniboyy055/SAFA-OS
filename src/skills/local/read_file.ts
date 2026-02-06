import * as fs from "node:fs";
import * as path from "node:path";

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

const realpathSync =
  typeof fs.realpathSync.native === "function"
    ? fs.realpathSync.native
    : fs.realpathSync;

const DENY_DIRECTORIES = new Set([
  "governance",
  "specs",
  ".git",
  "node_modules"
]);

function resolveRelativePath(inputPath: string, rootDir: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("Input path is required.");
  }
  if (path.isAbsolute(inputPath)) {
    throw new Error("Absolute paths are not allowed.");
  }
  const resolved = path.resolve(rootDir, inputPath);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal is not allowed.");
  }
  return resolved;
}

function findNearestExistingParentDir(
  targetPath: string,
  rootDir: string
): string {
  let current = targetPath;
  while (true) {
    if (fs.existsSync(current)) {
      const stats = fs.statSync(current);
      if (stats.isDirectory()) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return rootDir;
    }
    current = parent;
  }
}

function toCanonicalPath(targetPath: string, rootDir: string): {
  canonicalTarget: string;
  canonicalRoot: string;
} {
  const canonicalRoot = realpathSync(rootDir);
  const parentDir = findNearestExistingParentDir(targetPath, rootDir);
  const parentReal = realpathSync(parentDir);
  const relativeFromParent = path.relative(parentDir, targetPath);
  const canonicalTarget = path.resolve(parentReal, relativeFromParent);
  const relativeToRoot = path.relative(canonicalRoot, canonicalTarget);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("Path escapes root directory.");
  }
  return { canonicalTarget, canonicalRoot };
}

function isDeniedPath(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).filter(Boolean);
  if (normalized.length === 0) {
    return false;
  }
  if (normalized.some((segment) => DENY_DIRECTORIES.has(segment))) {
    return true;
  }
  if (
    normalized.some(
      (segment) => segment === ".env" || segment.startsWith(".env.")
    )
  ) {
    return true;
  }
  return false;
}

function isPathAllowed(
  canonicalTarget: string,
  allowlist: string[],
  rootDir: string
): boolean {
  if (allowlist.length === 0) {
    return false;
  }
  const canonicalAllowlist = allowlist.map((entry) => {
    const resolved = path.isAbsolute(entry)
      ? entry
      : path.resolve(rootDir, entry);
    return toCanonicalPath(resolved, rootDir).canonicalTarget;
  });
  return canonicalAllowlist.some((root) => {
    return (
      canonicalTarget === root || canonicalTarget.startsWith(root + path.sep)
    );
  });
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
    const resolvedPath = resolveRelativePath(input.path, context.config.rootDir);
    const { canonicalTarget, canonicalRoot } = toCanonicalPath(
      resolvedPath,
      context.config.rootDir
    );
    const relativeInput = path.relative(context.config.rootDir, resolvedPath);
    const relativeCanonical = path.relative(canonicalRoot, canonicalTarget);
    if (isDeniedPath(relativeInput) || isDeniedPath(relativeCanonical)) {
      throw new Error(
        "Reading from protected paths (.env, .git, governance, specs, node_modules) is not allowed."
      );
    }
    if (
      !isPathAllowed(
        canonicalTarget,
        context.config.permissions.readAllowlist,
        context.config.rootDir
      )
    ) {
      throw new Error("Read path is not allowlisted.");
    }
    const encoding = input.encoding ?? "utf8";
    const content = fs.readFileSync(canonicalTarget, { encoding });
    const stats = fs.statSync(canonicalTarget);
    return {
      path: canonicalTarget,
      content,
      bytes: stats.size
    };
  }
};
