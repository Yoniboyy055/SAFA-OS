import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { AuditLogger } from "./audit";

const CONSTITUTION_PATH = path.resolve(process.cwd(), "governor", "constitution.md");
const CONSTITUTION_HASH_PATH = path.resolve(
  process.cwd(),
  "governor",
  "constitution.sha256"
);
const DEFAULT_LOG_PATH = path.resolve(process.cwd(), "logs", "audit.log");

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractVersion(content: string): string {
  const match = content.match(/^Version:\s*(.+)$/m);
  if (!match || !match[1]) {
    throw new Error("Constitution version header missing.");
  }
  return match[1].trim();
}

export function readConstitution(): { content: string; version: string } {
  if (!fs.existsSync(CONSTITUTION_PATH)) {
    throw new Error("Constitution file is missing.");
  }
  const content = fs.readFileSync(CONSTITUTION_PATH, "utf8");
  const version = extractVersion(content);
  return { content, version };
}

export function readConstitutionHash(): string {
  if (!fs.existsSync(CONSTITUTION_HASH_PATH)) {
    throw new Error("Constitution hash file is missing.");
  }
  return fs.readFileSync(CONSTITUTION_HASH_PATH, "utf8").trim().toLowerCase();
}

export function computeConstitutionHash(content: string): string {
  return hashValue(content);
}

export function verifyConstitution(audit: AuditLogger, actor: string): void {
  try {
    const { content, version } = readConstitution();
    const expected = readConstitutionHash();
    const actual = computeConstitutionHash(content);
    if (!expected) {
      throw new Error("Constitution hash is empty.");
    }
    if (expected !== actual) {
      throw new Error("Constitution hash mismatch.");
    }
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "constitution.verified",
      approved: true,
      target: version,
      result: actual
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "constitution.invalid",
      approved: false,
      target: "constitution",
      result: message
    });
    throw error;
  }
}

export function updateConstitutionHash(
  audit: AuditLogger,
  actor: string,
  expectedVersion?: string
): { version: string; hash: string } {
  const { content, version } = readConstitution();
  if (expectedVersion && version !== expectedVersion) {
    const message = `Constitution version mismatch. Expected ${expectedVersion} but found ${version}.`;
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "constitution.update.denied",
      approved: false,
      target: version,
      result: message
    });
    throw new Error(message);
  }

  const nextHash = computeConstitutionHash(content);
  const existing = fs.existsSync(CONSTITUTION_HASH_PATH)
    ? fs.readFileSync(CONSTITUTION_HASH_PATH, "utf8").trim().toLowerCase()
    : "";

  if (existing === nextHash) {
    const message = "Constitution hash already current.";
    audit.log({
      timestamp: new Date().toISOString(),
      actor,
      action: "constitution.update.noop",
      approved: false,
      target: version,
      result: message
    });
    throw new Error(message);
  }

  fs.writeFileSync(CONSTITUTION_HASH_PATH, `${nextHash}\n`, "utf8");
  audit.log({
    timestamp: new Date().toISOString(),
    actor,
    action: "constitution.updated",
    approved: true,
    target: version,
    result: nextHash
  });

  return { version, hash: nextHash };
}

export function verifyConstitutionOrExit(
  actor: string,
  options?: { logPath?: string; redactKeys?: string[] }
): void {
  const audit = new AuditLogger({
    logPath: options?.logPath ?? DEFAULT_LOG_PATH,
    redactKeys: options?.redactKeys ?? []
  });

  try {
    verifyConstitution(audit, actor);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
