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

export interface SpatialWorldState {
  windows: SpatialWindowModel[];
  updatedAt: string;
}

export interface SpatialEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
}

export type SpatialEventListener = (event: SpatialEvent) => void;
