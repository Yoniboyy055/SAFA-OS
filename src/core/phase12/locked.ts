const LOCKED_MESSAGE = "PHASE_12_LOCKED — IMPLEMENTED BUT NOT ACTIVATED";

export function connectLiveModel(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function startAutoRoute(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function getPhase12LockMessage(): string {
  return LOCKED_MESSAGE;
}
