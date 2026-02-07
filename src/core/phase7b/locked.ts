const LOCKED_MESSAGE =
  "Phase 7B is locked. Activation requires explicit owner command.";

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
