import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

export type MemoryTier = "raw" | "work" | "canon";

export interface SearchResult {
  file: string;
  line: number;
  preview: string;
}

export interface SearchOptions {
  maxResults?: number;
  maxFileSizeBytes?: number;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function resolveMemoryDir(rootDir: string, tier: MemoryTier): string {
  const dir = path.join(rootDir, "memory", tier);
  ensureDir(dir);
  return dir;
}

export function appendRawEntry(
  rootDir: string,
  payload: Record<string, unknown>
): { filePath: string } {
  const dir = resolveMemoryDir(rootDir, "raw");
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);
  const filePath = path.join(dir, `${dateStamp}.log`);
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, {
    encoding: "utf8",
    flag: "a"
  });
  return { filePath };
}

export function writeTierEntry(
  rootDir: string,
  tier: "work" | "canon",
  title: string,
  content: string
): { filePath: string; id: string } {
  const dir = resolveMemoryDir(rootDir, tier);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
  const safeTitle = title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
  const filename = `${tier}_${timestamp}_${safeTitle || "entry"}_${hash}.txt`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return { filePath, id: `${tier}-${hash}` };
}

export function searchMemory(
  rootDir: string,
  tier: MemoryTier,
  query: string,
  options: SearchOptions = {}
): { matches: SearchResult[]; truncated: boolean; filesSearched: number } {
  const dir = resolveMemoryDir(rootDir, tier);
  const maxResults = options.maxResults ?? 100;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? 1024 * 1024;
  const matches: SearchResult[] = [];
  let truncated = false;
  let filesSearched = 0;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (matches.length >= maxResults) {
      truncated = true;
      break;
    }
    if (!entry.isFile()) {
      continue;
    }
    const filePath = path.join(dir, entry.name);
    const stats = fs.statSync(filePath);
    if (stats.size > maxFileSizeBytes) {
      continue;
    }
    filesSearched += 1;
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      if (line.includes(query)) {
        matches.push({
          file: filePath,
          line: index + 1,
          preview: line.slice(0, 200)
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
