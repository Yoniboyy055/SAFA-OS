import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export type MemoryBucket = "canon" | "notes" | "artifacts";

export interface MemoryEntry {
  id: string;
  bucket: MemoryBucket;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalId?: string;
}

export interface MemorySearchResult {
  file: string;
  line: number;
  preview: string;
}

export interface MemorySearchOutput {
  matches: MemorySearchResult[];
  truncated: boolean;
  filesSearched: number;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function resolveMemoryBase(rootDir: string): string {
  const base = path.join(rootDir, "data", "memory");
  ensureDir(base);
  return base;
}

export function resolveBucketDir(rootDir: string, bucket: MemoryBucket): string {
  const base = resolveMemoryBase(rootDir);
  const dir = path.join(base, bucket);
  ensureDir(dir);
  return dir;
}

export function assertAllowlistedPath(
  targetPath: string,
  allowlist: string[],
  rootDir: string
): void {
  if (allowlist.length === 0) {
    throw new Error("Path is not allowlisted.");
  }
  const resolvedAllowlist = allowlist.map((entry) =>
    path.isAbsolute(entry) ? entry : path.resolve(rootDir, entry)
  );
  const canonicalTarget = path.resolve(targetPath);
  const allowed = resolvedAllowlist.some((root) => {
    const canonicalRoot = path.resolve(root);
    return (
      canonicalTarget === canonicalRoot ||
      canonicalTarget.startsWith(canonicalRoot + path.sep)
    );
  });
  if (!allowed) {
    throw new Error("Path is not allowlisted.");
  }
}

export function writeMemoryEntry(
  rootDir: string,
  bucket: MemoryBucket,
  entry: {
    id?: string;
    title: string;
    content: string;
    tags?: string[];
    approvedBy?: string;
    approvedAt?: string;
    approvalId?: string;
  }
): { id: string; filePath: string } {
  const dir = resolveBucketDir(rootDir, bucket);
  const createdAt = new Date().toISOString();
  const contentHash = crypto
    .createHash("sha256")
    .update(entry.content)
    .digest("hex");
  const id = entry.id ?? contentHash.slice(0, 12);
  const filePath = path.join(dir, `entry_${id}.json`);
  const payload: MemoryEntry = {
    id,
    bucket,
    title: entry.title,
    content: entry.content,
    tags: entry.tags ?? [],
    createdAt,
    approvedBy: entry.approvedBy,
    approvedAt: entry.approvedAt,
    approvalId: entry.approvalId
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return { id, filePath };
}

export function readMemoryEntry(
  rootDir: string,
  bucket: MemoryBucket,
  id: string
): MemoryEntry {
  const dir = resolveBucketDir(rootDir, bucket);
  const filePath = path.join(dir, `entry_${id}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error("Memory entry not found.");
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as MemoryEntry;
  return parsed;
}

export function deleteMemoryEntry(
  rootDir: string,
  bucket: MemoryBucket,
  id: string
): { filePath: string } {
  const dir = resolveBucketDir(rootDir, bucket);
  const filePath = path.join(dir, `entry_${id}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error("Memory entry not found.");
  }
  fs.unlinkSync(filePath);
  return { filePath };
}

export function listMemoryEntries(
  rootDir: string,
  bucket: MemoryBucket
): MemoryEntry[] {
  const dir = resolveBucketDir(rootDir, bucket);
  const entries: MemoryEntry[] = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) {
      continue;
    }
    const raw = fs.readFileSync(path.join(dir, file.name), "utf8");
    entries.push(JSON.parse(raw) as MemoryEntry);
  }
  return entries;
}

export function searchMemoryEntries(
  rootDir: string,
  bucket: MemoryBucket,
  query: string,
  options?: { maxResults?: number; maxFileSizeBytes?: number }
): MemorySearchOutput {
  const dir = resolveBucketDir(rootDir, bucket);
  const maxResults = options?.maxResults ?? 100;
  const maxFileSizeBytes = options?.maxFileSizeBytes ?? 1024 * 1024;
  const matches: MemorySearchResult[] = [];
  let truncated = false;
  let filesSearched = 0;

  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (matches.length >= maxResults) {
      truncated = true;
      break;
    }
    if (!file.isFile() || !file.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(dir, file.name);
    const stats = fs.statSync(filePath);
    if (stats.size > maxFileSizeBytes) {
      continue;
    }
    filesSearched += 1;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as MemoryEntry;
    const content = parsed.content ?? "";
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(query)) {
        matches.push({
          file: filePath,
          line: index + 1,
          preview: lines[index].slice(0, 200)
        });
        if (matches.length >= maxResults) {
          truncated = true;
          break;
        }
      }
    }
  }

  return { matches, truncated, filesSearched };
}
