const LOCKED_MESSAGE = "LOCKED: Layer 4 disabled";

export interface SpawnRequest {
  name: string;
  purpose: string;
}

export function spawnAgent(_request: SpawnRequest): never {
  throw new Error(LOCKED_MESSAGE);
}

export function getLayer4LockMessage(): string {
  return LOCKED_MESSAGE;
}
