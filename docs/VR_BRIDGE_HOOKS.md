# VR Bridge Hooks (Spatial Window Interfaces)

This document defines the bridge hooks only. There is no runtime implementation here.

## Goals

- Represent spatial windows with depth, anchors, and input affordances.
- Keep compatibility with the existing OS window layer by modeling a window as an ID, title, layer, and focus state.
- Enable later mapping to VR runtimes without changing the current governance or routing.

## Data Model (TypeScript)

```ts
export type SpatialWindowId = string;
export type SpatialLayerId = string;

export type SpatialAnchorType = "viewport" | "world" | "entity";

export interface SpatialAnchor {
  type: SpatialAnchorType;
  targetId?: string;
  offset: { x: number; y: number; z: number };
}

export interface SpatialBounds {
  width: number;
  height: number;
  depth: number;
}

export interface SpatialDepth {
  zIndex: number;
  elevation: number;
}

export interface GazeTarget {
  id: string;
  role: "window" | "control" | "hint";
  focusRing?: boolean;
  dwellMs?: number;
}

export interface HandInputHints {
  pinchSelect?: boolean;
  grabMove?: boolean;
  twoHandScale?: boolean;
}

export interface SpatialWindowModel {
  id: SpatialWindowId;
  title: string;
  layerId: SpatialLayerId;
  anchor: SpatialAnchor;
  bounds: SpatialBounds;
  depth: SpatialDepth;
  isFocused: boolean;
  gazeTargets: GazeTarget[];
  handInput: HandInputHints;
  tags?: string[];
}

export interface SpatialWindowUpdate {
  id: SpatialWindowId;
  anchor?: SpatialAnchor;
  bounds?: SpatialBounds;
  depth?: SpatialDepth;
  isFocused?: boolean;
  gazeTargets?: GazeTarget[];
  handInput?: HandInputHints;
}

export interface SpatialWindowBridge {
  list(): SpatialWindowModel[];
  upsert(window: SpatialWindowModel): void;
  update(change: SpatialWindowUpdate): void;
  remove(id: SpatialWindowId): void;
}
```

## Bridge Hooks

- **Window Registry Adapter**: map the current OS window layer entries into `SpatialWindowModel` with stable IDs.
- **Input Surface Adapter**: translate gaze and pinch events into `SpatialWindowUpdate` without changing current command execution paths.
- **Depth Policy**: map existing window focus to `depth.zIndex` and `depth.elevation`.
