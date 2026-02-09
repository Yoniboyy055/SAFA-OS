import * as path from "node:path";

import { AuditLogger } from "../src/core/audit";
import { verifyConstitution } from "../src/core/constitution";

const DEFAULT_LOG_PATH = path.resolve(process.cwd(), "logs", "audit.log");

export function verifyConstitutionOrExit(
  actor: string,
  options?: { logPath?: string; redactKeys?: string[] }
): void {
  const logPath = options?.logPath ?? DEFAULT_LOG_PATH;
  const audit = new AuditLogger({
    logPath,
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

if (require.main === module) {
  verifyConstitutionOrExit("constitution.verify");
  console.log("OK: constitution verified.");
}
