import * as fs from "node:fs";
import * as path from "node:path";

import type { SkillDefinition } from "../../types/skill";

interface WriteFileInput {
  path: string;
  content: string;
  encoding?: string;
  overwrite?: boolean;
  createDirs?: boolean;
  dryRun?: boolean;
}

interface WriteFileOutput {
  path: string;
  bytes: number;
  preview?: boolean;
}

const DENY_DIRECTORIES = new Set([
  "governance",
  "specs",
  ".git",
  "node_modules"
]);
const DENY_ROOT_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "jarvis.config.json",
  "README.md"
]);

const realpathSync =
  typeof fs.realpathSync.native === "function"
    ? fs.realpathSync.native
    : fs.realpathSync;

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
  if (normalized.length === 1 && DENY_ROOT_FILES.has(normalized[0])) {
    return true;
  }
  return false;
}

function isPathAllowed(
  canonicalTarget: string,
  allowlist: string[],
  rootDir: string
): boolean {
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
      },
      dryRun: {
        type: "boolean",
        description: "Preview only without writing."
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
    const resolvedPath = resolveRelativePath(input.path, context.config.rootDir);
    if (typeof input.content !== "string") {
      throw new Error("Content must be a string.");
    }
    const { canonicalTarget, canonicalRoot } = toCanonicalPath(
      resolvedPath,
      context.config.rootDir
    );
    const relativeInput = path.relative(context.config.rootDir, resolvedPath);
    const relativeCanonical = path.relative(canonicalRoot, canonicalTarget);
    if (isDeniedPath(relativeInput) || isDeniedPath(relativeCanonical)) {
      throw new Error("Write target is in a protected path.");
    }
    if (
      !isPathAllowed(
        canonicalTarget,
        context.config.permissions.writeAllowlist,
        context.config.rootDir
      )
    ) {
      throw new Error("Write path is not allowlisted.");
    }
    const encoding = input.encoding ?? "utf8";
    const overwrite = input.overwrite ?? false;
    const createDirs = input.createDirs ?? false;
    const dryRun = input.dryRun === true;

    if (fs.existsSync(canonicalTarget) && !overwrite) {
      throw new Error("Target file exists. Set overwrite to true to replace.");
    }

    if (dryRun) {
      return {
        path: canonicalTarget,
        bytes: Buffer.byteLength(input.content),
        preview: true
      };
    }

    if (createDirs) {
      const dir = path.dirname(canonicalTarget);
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(canonicalTarget, input.content, { encoding });
    return {
      path: canonicalTarget,
      bytes: fs.statSync(canonicalTarget).size
    };
  }
};
