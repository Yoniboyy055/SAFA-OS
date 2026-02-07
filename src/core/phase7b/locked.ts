const LOCKED_MESSAGE = "PHASE_7B_LOCKED — IMPLEMENTED BUT NOT ACTIVATED";
const LOCKED_SKILLS = new Set([
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

export function scheduleWorkflow(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function startScheduler(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function initiateCallFlow(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function negotiateIntent(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function executeBusinessLogic(): never {
  throw new Error(LOCKED_MESSAGE);
}

export function switchIdentityContext(): never {
  throw new Error(LOCKED_MESSAGE);
}
