const LOCKED_MESSAGE = "PHASE_15_LOCKED — IMPLEMENTED BUT NOT ACTIVATED";

export function activateNetworkWindow(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function registerLiveProvider(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function getPhase15LockMessage(): string {
  return LOCKED_MESSAGE;
}
