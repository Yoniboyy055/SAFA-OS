import type {
  SpatialWindowBridge,
  SpatialWindowModel,
  SpatialWindowUpdate
} from "./types";

export function createSpatialWindowBridge(
  seed: SpatialWindowModel[] = []
): SpatialWindowBridge {
  const windows = new Map<string, SpatialWindowModel>();
  seed.forEach((window) => windows.set(window.id, window));

  return {
    list(): SpatialWindowModel[] {
      return Array.from(windows.values());
    },
    upsert(window: SpatialWindowModel): void {
      windows.set(window.id, window);
    },
    update(change: SpatialWindowUpdate): void {
      const existing = windows.get(change.id);
      if (!existing) {
        return;
      }
      windows.set(change.id, {
        ...existing,
        ...change,
        anchor: change.anchor ?? existing.anchor,
        bounds: change.bounds ?? existing.bounds,
        depth: change.depth ?? existing.depth,
        gazeTargets: change.gazeTargets ?? existing.gazeTargets,
        handInput: change.handInput ?? existing.handInput
      });
    },
    remove(id: string): void {
      windows.delete(id);
    }
  };
}
