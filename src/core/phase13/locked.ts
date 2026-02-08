const LOCKED_MESSAGE = "PHASE_13_LOCKED — IMPLEMENTED BUT NOT ACTIVATED";

export function runClientIntake(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function runNegotiationFlow(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function runFollowUpFlow(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function getPhase13LockMessage(): string {
  return LOCKED_MESSAGE;
}
