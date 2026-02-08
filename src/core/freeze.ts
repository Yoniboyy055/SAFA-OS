import * as fs from "node:fs";
import * as path from "node:path";

export interface FreezeState {
  enabled: boolean;
  reason?: string;
  actor?: string;
  at?: string;
}

const FREEZE_DIR = path.join("data", "control");
const FREEZE_FILE = "freeze.json";

function resolveFreezePath(rootDir: string): string {
  return path.resolve(rootDir, FREEZE_DIR, FREEZE_FILE);
}

export function readFreezeState(rootDir: string): FreezeState {
  const freezePath = resolveFreezePath(rootDir);
  if (!fs.existsSync(freezePath)) {
    return { enabled: false };
  }
  try {
    const raw = fs.readFileSync(freezePath, "utf8");
    const parsed = JSON.parse(raw) as FreezeState;
    return {
      enabled: Boolean(parsed.enabled),
      reason: parsed.reason,
      actor: parsed.actor,
      at: parsed.at
    };
  } catch {
    return { enabled: false };
  }
}

export function setFreezeState(
  rootDir: string,
  state: FreezeState
): FreezeState {
  const freezePath = resolveFreezePath(rootDir);
  fs.mkdirSync(path.dirname(freezePath), { recursive: true });
  const payload: FreezeState = {
    enabled: state.enabled,
    reason: state.reason,
    actor: state.actor,
    at: state.at ?? new Date().toISOString()
  };
  fs.writeFileSync(freezePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export function enableFreeze(
  rootDir: string,
  actor: string,
  reason?: string
): FreezeState {
  return setFreezeState(rootDir, {
    enabled: true,
    actor,
    reason,
    at: new Date().toISOString()
  });
}

export function clearFreeze(
  rootDir: string,
  actor: string,
  reason?: string
): FreezeState {
  return setFreezeState(rootDir, {
    enabled: false,
    actor,
    reason,
    at: new Date().toISOString()
  });
}
