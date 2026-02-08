import type { SpatialWindowBridge, SpatialWorldState } from "./types";

export function exportWorldState(bridge: SpatialWindowBridge): SpatialWorldState {
  return {
    windows: bridge.list(),
    updatedAt: new Date().toISOString()
  };
}
