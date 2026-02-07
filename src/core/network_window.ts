const fs = require("fs");
const path = require("path");

export interface NetworkWindowState {
  enabled: boolean;
  startAt: string;
  endAt: string;
  openedBy: string;
  openedAt: string;
}

const EMPTY_STATE: NetworkWindowState = {
  enabled: false,
  startAt: "",
  endAt: "",
  openedBy: "",
  openedAt: ""
};

function resolveWindowPath(rootDir: string): string {
  return path.resolve(rootDir, "data", "network_window.json");
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadNetworkWindow(rootDir: string): NetworkWindowState {
  const filePath = resolveWindowPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return { ...EMPTY_STATE };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        enabled: parsed.enabled === true,
        startAt: typeof parsed.startAt === "string" ? parsed.startAt : "",
        endAt: typeof parsed.endAt === "string" ? parsed.endAt : "",
        openedBy: typeof parsed.openedBy === "string" ? parsed.openedBy : "",
        openedAt: typeof parsed.openedAt === "string" ? parsed.openedAt : ""
      };
    }
  } catch {
    // corrupted file, return empty
  }
  return { ...EMPTY_STATE };
}

export function saveNetworkWindow(
  rootDir: string,
  state: NetworkWindowState
): void {
  const filePath = resolveWindowPath(rootDir);
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

export function openNetworkWindow(
  rootDir: string,
  hours: number,
  actor: string
): NetworkWindowState {
  const now = new Date();
  const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const state: NetworkWindowState = {
    enabled: true,
    startAt: now.toISOString(),
    endAt: end.toISOString(),
    openedBy: actor,
    openedAt: now.toISOString()
  };
  saveNetworkWindow(rootDir, state);
  return state;
}

export function closeNetworkWindow(
  rootDir: string,
  actor: string
): NetworkWindowState {
  const state: NetworkWindowState = {
    enabled: false,
    startAt: "",
    endAt: "",
    openedBy: actor,
    openedAt: new Date().toISOString()
  };
  saveNetworkWindow(rootDir, state);
  return state;
}

export function isNetworkWindowActive(
  state: NetworkWindowState,
  now?: Date
): boolean {
  if (!state.enabled) {
    return false;
  }
  if (!state.startAt || !state.endAt) {
    return false;
  }
  const currentTime = (now ?? new Date()).getTime();
  const start = Date.parse(state.startAt);
  const end = Date.parse(state.endAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }
  return currentTime >= start && currentTime < end;
}
