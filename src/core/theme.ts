import type { ResolvedConfig } from "./config";
import type { FreezeState } from "./freeze";
import type { VrState } from "./vr";

export type ThemeId = "safe" | "freeze" | "warning" | "offline";

export interface ThemeState {
  id: ThemeId;
  accent: string;
  glow: string;
}

export function resolveTheme(
  config: ResolvedConfig,
  freeze: FreezeState,
  vr: VrState
): ThemeState {
  if (freeze.enabled) {
    return {
      id: "freeze",
      accent: "#f97316",
      glow: "rgba(251, 146, 60, 0.4)"
    };
  }
  if (config.killSwitch.enabled) {
    return {
      id: "safe",
      accent: "#60a5fa",
      glow: "rgba(96, 165, 250, 0.35)"
    };
  }
  if (config.network.enabled) {
    return {
      id: "warning",
      accent: "#facc15",
      glow: "rgba(250, 204, 21, 0.35)"
    };
  }
  if (!vr.armed) {
    return {
      id: "offline",
      accent: "#94a3b8",
      glow: "rgba(148, 163, 184, 0.35)"
    };
  }
  return {
    id: "safe",
    accent: "#60a5fa",
    glow: "rgba(96, 165, 250, 0.35)"
  };
}
