import * as fs from "node:fs";
import * as path from "node:path";

export interface VrState {
  enabled: boolean;
  armed: boolean;
  armedBy?: string;
  armedAt?: string;
}

const VR_DIR = path.join("data", "control");
const VR_FILE = "vr.json";

function resolveVrPath(rootDir: string): string {
  return path.resolve(rootDir, VR_DIR, VR_FILE);
}

export function readVrState(rootDir: string): VrState {
  const vrPath = resolveVrPath(rootDir);
  if (!fs.existsSync(vrPath)) {
    return { enabled: true, armed: false };
  }
  try {
    const raw = fs.readFileSync(vrPath, "utf8");
    const parsed = JSON.parse(raw) as VrState;
    return {
      enabled: true,
      armed: Boolean(parsed.armed),
      armedBy: parsed.armedBy,
      armedAt: parsed.armedAt
    };
  } catch {
    return { enabled: true, armed: false };
  }
}

export function assertVrEnvArmed(): void {
  if (process.env.JARVIS_VR_ARMED !== "1") {
    throw new Error("VR hardware is disarmed. Set JARVIS_VR_ARMED=1 to arm.");
  }
}

export function armVr(rootDir: string, actor: string): VrState {
  assertVrEnvArmed();
  const vrPath = resolveVrPath(rootDir);
  fs.mkdirSync(path.dirname(vrPath), { recursive: true });
  const state: VrState = {
    enabled: true,
    armed: true,
    armedBy: actor,
    armedAt: new Date().toISOString()
  };
  fs.writeFileSync(vrPath, JSON.stringify(state, null, 2), "utf8");
  return state;
}

export function disarmVr(rootDir: string, actor: string): VrState {
  const vrPath = resolveVrPath(rootDir);
  fs.mkdirSync(path.dirname(vrPath), { recursive: true });
  const state: VrState = {
    enabled: true,
    armed: false,
    armedBy: actor,
    armedAt: new Date().toISOString()
  };
  fs.writeFileSync(vrPath, JSON.stringify(state, null, 2), "utf8");
  return state;
}
