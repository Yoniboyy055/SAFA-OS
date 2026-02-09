import * as path from "node:path";
import type { ResolvedConfig } from "./config";

function isNonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasEntries(values: string[] | undefined): boolean {
  return Array.isArray(values) && values.length > 0;
}

function hasWildcard(values: string[] | undefined): boolean {
  return Array.isArray(values) && values.some((entry) => entry.trim() === "*");
}

function hasEmptyEntry(values: string[] | undefined): boolean {
  return Array.isArray(values) && values.some((entry) => entry.trim().length === 0);
}

const RELEASE_LOCK_CATEGORIES = new Set([
  "local",
  "network",
  "outbound_message",
  "external_tool"
]);

function assert(
  condition: boolean,
  message: string
): void {
  if (!condition) {
    throw new Error(message);
  }
}

function isSubpath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validateConfig(config: ResolvedConfig): void {
  const logsRoot = path.resolve(config.rootDir, "logs");
  const auditPath = path.resolve(config.audit.logPath);
  assert(
    isSubpath(logsRoot, auditPath),
    "Audit log path must stay within logs/."
  );

  if (config.network.enabled) {
    assert(
      hasEntries(config.network.allowlistDomains) ||
        hasEntries(config.network.allowlistUrls),
      "Network enabled requires a non-empty allowlist."
    );
  }

  assert(
    !hasWildcard(config.network.allowlist) &&
      !hasWildcard(config.network.allowlistDomains) &&
      !hasWildcard(config.network.allowlistUrls),
    "Network allowlist cannot contain wildcard entries."
  );
  assert(
    !hasEmptyEntry(config.network.allowlist) &&
      !hasEmptyEntry(config.network.allowlistDomains) &&
      !hasEmptyEntry(config.network.allowlistUrls),
    "Network allowlist cannot contain empty entries."
  );

  if (config.email.enabled) {
    assert(isNonEmpty(config.email.from), "Email enabled requires email.from.");
    assert(
      isNonEmpty(config.email.smtp.host),
      "Email enabled requires smtp.host."
    );
    assert(
      typeof config.email.smtp.port === "number",
      "Email enabled requires smtp.port."
    );
    assert(
      hasEntries(config.email.toAllowlist) ||
        hasEntries(config.email.domainAllowlist),
      "Email enabled requires recipient allowlists."
    );
  }

  if (config.stripe.enabled) {
    assert(
      isNonEmpty(config.stripe.successUrl) &&
        isNonEmpty(config.stripe.cancelUrl),
      "Stripe enabled requires successUrl and cancelUrl."
    );
    assert(
      hasEntries(config.permissions.stripePriceAllowlist) ||
        hasEntries(config.permissions.stripeAmountAllowlist),
      "Stripe enabled requires price or amount allowlists."
    );
  }

  if (config.calls.enabled) {
    assert(
      hasEntries(config.calls.toNumberAllowlist) &&
        hasEntries(config.calls.fromNumberAllowlist),
      "Calls enabled requires to/from number allowlists."
    );
    assert(
      isNonEmpty(config.calls.twimlUrl),
      "Calls enabled requires twimlUrl."
    );
  }

  if (config.execution.enabled) {
    assert(
      hasEntries(config.execution.allowCommands),
      "Execution enabled requires allowCommands."
    );
    assert(
      hasEntries(config.execution.allowlistPaths),
      "Execution enabled requires allowlistPaths."
    );
    assert(
      typeof config.execution.maxRuntimeMs === "number" &&
        config.execution.maxRuntimeMs > 0,
      "Execution enabled requires maxRuntimeMs > 0."
    );
  }

  if (config.releaseLock?.enabled) {
    const blocked = config.releaseLock.blockedCategories ?? [];
    blocked.forEach((category) => {
      assert(
        RELEASE_LOCK_CATEGORIES.has(category),
        `Release lock category not supported: ${category}.`
      );
    });
  }

  assert(
    typeof config.phase?.current === "number" &&
      config.phase.current >= 1 &&
      config.phase.current <= 17,
    "Phase current must be between 1 and 17."
  );
}
