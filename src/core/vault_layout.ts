import * as fs from "node:fs";
import * as path from "node:path";

export interface VaultLayout {
  memoryDir: string;
  dataDir: string;
  buckets: Record<string, string>;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function ensureVaultLayout(rootDir: string): VaultLayout {
  const dataDir = path.join(rootDir, "data");
  const memoryDir = path.join(rootDir, "memory");
  ensureDir(dataDir);
  ensureDir(memoryDir);

  const buckets: Record<string, string> = {
    raw: path.join(memoryDir, "raw"),
    work: path.join(memoryDir, "work"),
    canon: path.join(memoryDir, "canon"),
    memoryBase: path.join(dataDir, "memory"),
    notes: path.join(dataDir, "memory", "notes"),
    artifacts: path.join(dataDir, "memory", "artifacts"),
    canonStore: path.join(dataDir, "memory", "canon"),
    tasks: path.join(dataDir, "tasks"),
    approvals: path.join(dataDir, "approvals"),
    settings: path.join(dataDir, "settings")
  };

  Object.values(buckets).forEach((dir) => ensureDir(dir));

  return { memoryDir, dataDir, buckets };
}
