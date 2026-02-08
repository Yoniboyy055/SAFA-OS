import type { SpatialEvent, SpatialEventListener } from "./types";

const listeners = new Set<SpatialEventListener>();

export function emitSpatialEvent<T>(type: string, payload: T): void {
  const event: SpatialEvent<T> = {
    type,
    payload,
    timestamp: new Date().toISOString()
  };
  listeners.forEach((listener) => listener(event));
}

export function onSpatialEvent(listener: SpatialEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
