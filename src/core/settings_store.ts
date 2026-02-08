import * as fs from "node:fs";
import * as path from "node:path";

export interface SettingsSnapshot {
  updatedAt: string;
  values: Record<string, unknown>;
}

function resolveSettingsPath(rootDir: string): string {
  return path.join(rootDir, "data", "settings.json");
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadSettings(rootDir: string): SettingsSnapshot {
  const filePath = resolveSettingsPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return { updatedAt: new Date().toISOString(), values: {} };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return { updatedAt: new Date().toISOString(), values: {} };
  }
  try {
    const parsed = JSON.parse(raw) as SettingsSnapshot;
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      values: parsed.values ?? {}
    };
  } catch {
    return { updatedAt: new Date().toISOString(), values: {} };
  }
}

export function writeSettings(rootDir: string, values: Record<string, unknown>): SettingsSnapshot {
  const filePath = resolveSettingsPath(rootDir);
  ensureDir(filePath);
  const snapshot: SettingsSnapshot = {
    updatedAt: new Date().toISOString(),
    values
  };
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  return snapshot;
}

export function updateSettings(
  rootDir: string,
  patch: Record<string, unknown>
): SettingsSnapshot {
  const current = loadSettings(rootDir);
  const merged = { ...current.values, ...patch };
  return writeSettings(rootDir, merged);
}

export function setSetting(rootDir: string, key: string, value: unknown): SettingsSnapshot {
  const current = loadSettings(rootDir);
  const merged = { ...current.values, [key]: value };
  return writeSettings(rootDir, merged);
}
