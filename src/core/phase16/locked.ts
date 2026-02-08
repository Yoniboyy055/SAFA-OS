const LOCKED_MESSAGE = "PHASE_16_LOCKED — IMPLEMENTED BUT NOT ACTIVATED";

export function startBackgroundExecution(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function sendDesktopNotification(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function registerMobileCompanion(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function getPhase16LockMessage(): string {
  return LOCKED_MESSAGE;
}
