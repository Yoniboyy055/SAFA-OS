const LOCKED_MESSAGE = "LOCKED: Phase 7B not activated";
const LOCKED_SKILLS = new Set([
  "write_file",
  "send_email",
  "make_call",
  "request_payment",
  "send_http_request"
]);

export function assertPhase7bUnlocked(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function getPhase7bLockMessage(): string {
  return LOCKED_MESSAGE;
}

export function isPhase7bLockedSkill(name: string): boolean {
  return LOCKED_SKILLS.has(name);
}

export function createOutreachPlan(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function createMessageFlow(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function initiateCallFlow(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function negotiateIntent(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function switchIdentityContext(): never {
  throw new Error(LOCKED_MESSAGE);
}
