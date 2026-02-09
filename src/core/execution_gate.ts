import { AsyncLocalStorage } from "node:async_hooks";

import type { AuditLogger } from "./audit";

type CommandSource = "cli" | "dashboard" | "conversation" | "test";
type CommandKind = "interactive" | "delegated";

export interface CommandContext {
  id: string;
  actor: string;
  source: CommandSource;
  command: string;
  issuedAt: string;
  kind?: CommandKind;
  delegatedToken?: string;
}

export interface DelegatedJobToken {
  token: string;
  actor: string;
  scope: string[];
  expiresAt: string;
}

const commandContextStore = new AsyncLocalStorage<CommandContext>();
const delegatedTokenStore = new Map<string, DelegatedJobToken>();

export function withCommandContext<T>(
  context: Omit<CommandContext, "issuedAt">,
  fn: () => T
): T {
  const payload: CommandContext = {
    ...context,
    kind: context.kind ?? "interactive",
    issuedAt: new Date().toISOString()
  };
  return commandContextStore.run(payload, fn);
}

export function enterCommandContext(
  context: Omit<CommandContext, "issuedAt">
): void {
  commandContextStore.enterWith({
    ...context,
    kind: context.kind ?? "interactive",
    issuedAt: new Date().toISOString()
  });
}

export function getCommandContext(): CommandContext | undefined {
  return commandContextStore.getStore();
}

export function createDelegatedJobToken(
  actor: string,
  scope: string[],
  ttlMs: number
): DelegatedJobToken {
  const token = `job-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const record: DelegatedJobToken = {
    token,
    actor,
    scope,
    expiresAt
  };
  delegatedTokenStore.set(token, record);
  return record;
}

export function revokeDelegatedJobToken(token: string): void {
  delegatedTokenStore.delete(token);
}

export function withDelegatedJobContext<T>(
  token: string,
  actor: string,
  source: CommandSource,
  command: string,
  fn: () => T
): T {
  return withCommandContext(
    {
      id: `job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      actor,
      source,
      command,
      kind: "delegated",
      delegatedToken: token
    },
    fn
  );
}

function isTokenExpired(expiresAt: string): boolean {
  const expiry = Date.parse(expiresAt);
  return Number.isNaN(expiry) || Date.now() >= expiry;
}

export function assertOwnerCommandContext(
  audit: AuditLogger,
  actor: string,
  target: string
): void {
  const context = getCommandContext();
  if (context && context.kind !== "delegated") {
    return;
  }
  if (context && context.kind === "delegated") {
    const token = context.delegatedToken;
    if (!token) {
      const reason = "Autonomy blocked: delegated token missing.";
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "autonomy.blocked",
        approved: false,
        target,
        result: reason
      });
      throw new Error(reason);
    }
    const record = delegatedTokenStore.get(token);
    if (!record) {
      const reason = "Autonomy blocked: delegated token invalid.";
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "autonomy.blocked",
        approved: false,
        target,
        result: reason
      });
      throw new Error(reason);
    }
    if (record.actor !== actor) {
      const reason = "Autonomy blocked: delegated token actor mismatch.";
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "autonomy.blocked",
        approved: false,
        target,
        result: reason
      });
      throw new Error(reason);
    }
    if (isTokenExpired(record.expiresAt)) {
      const reason = "Autonomy blocked: delegated token expired.";
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "autonomy.blocked",
        approved: false,
        target,
        result: reason
      });
      throw new Error(reason);
    }
    if (!record.scope.includes(target)) {
      const reason = "Autonomy blocked: delegated token scope violation.";
      audit.log({
        timestamp: new Date().toISOString(),
        actor,
        action: "autonomy.blocked",
        approved: false,
        target,
        result: reason
      });
      throw new Error(reason);
    }
    return;
  }
  const reason = "Autonomy blocked: no active owner command context.";
  audit.log({
    timestamp: new Date().toISOString(),
    actor,
    action: "autonomy.blocked",
    approved: false,
    target,
    result: reason
  });
  throw new Error(reason);
}
