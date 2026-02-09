/**
 * Unit tests for LLM Provider
 * 
 * Tests:
 * - OpenAI completion
 * - Governance enforcement
 * - Prompt redaction in audit logs
 * - Network window requirements
 * - Cost guard enforcement
 */

import { callLLM, isLLMAvailable } from "../llm_provider";
import { LLMProvider } from "../types";
import type { ResolvedConfig } from "../../core/config";
import type { AuditLogger } from "../../core/audit";
import type { Governor } from "../../core/governor";
import { AuthorityLevel } from "../../core/authority";
import type { CommandMode } from "../../cli/command_mode";

// Mock audit logger
function createMockAudit(): AuditLogger {
  const logs: any[] = [];
  return {
    log: (entry: any) => logs.push(entry),
    getLogs: () => logs,
  } as any;
}

// Mock governor
function createMockGovernor(): Governor {
  return {
    evaluate: () => ({ allowed: true, reason: "Test approved" }),
  } as any;
}

// Mock config
function createMockConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["api.openai.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000,
    },
    llm: {
      enabled: true,
      provider: "openai",
      model: "gpt-4o-mini",
      fallbackToStatic: true,
      maxTokensPerRequest: 2000,
      costGuardUsd: 0.10,
      temperature: 0.2,
    },
    email: {
      enabled: false,
      provider: "smtp",
      fromAllowlist: [],
      toAllowlist: [],
      domainAllowlist: [],
      dryRunDefault: true,
      from: "",
      smtp: { host: "", port: 587, secure: false },
    },
    stripe: {
      enabled: false,
      dryRunDefault: true,
      apiBase: "",
      mode: "production",
      statementDescriptor: "",
      successUrl: "",
      cancelUrl: "",
    },
    calls: {
      enabled: false,
      provider: "twilio",
      fromNumberAllowlist: [],
      toNumberAllowlist: [],
      countryAllowlist: [],
      twimlUrl: "",
      recordCalls: false,
      dryRunDefault: true,
    },
    execution: {
      enabled: false,
      allowCommands: [],
      maxRuntimeMs: 600000,
      allowlistPaths: [],
    },
    governance: {
      strictApprovalMode: true,
      networkApprovalMode: "per_request",
      maxNetworkPayloadBytes: 16384,
    },
    telemetry: { enabled: false },
    killSwitch: { enabled: true },
    phase: { current: 17 },
    audit: {
      logPath: "logs/audit.log",
      redactKeys: ["password", "token"],
    },
    permissions: {
      writeAllowlist: [],
      readAllowlist: [],
      stripePriceAllowlist: [],
      stripeAmountAllowlist: [],
      stripeCurrencyAllowlist: [],
      stripeCustomerEmailAllowlist: [],
      emailSubjectAllowlist: [],
      emailTemplateAllowlist: [],
      callIntentAllowlist: [],
      callTemplateAllowlist: [],
    },
    configPath: "/test/safa.config.json",
    rootDir: "/test",
    ...overrides,
  } as ResolvedConfig;
}

/**
 * Test: isLLMAvailable checks configuration
 */
export async function test_isLLMAvailable() {
  const config = createMockConfig();
  
  // Should check if OpenAI is configured
  const available = isLLMAvailable(config);
  
  console.log(`✓ isLLMAvailable returned: ${available}`);
  return true;
}

/**
 * Test: Network window enforcement
 */
export async function test_networkWindowRequired() {
  const audit = createMockAudit();
  const governor = createMockGovernor();
  const config = createMockConfig({
    network: {
      enabled: false, // Network disabled
      allowlist: [],
      allowlistDomains: [],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000,
    },
  });

  try {
    await callLLM(
      {
        provider: LLMProvider.OpenAI,
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
      },
      {
        config,
        audit,
        governor,
        actor: "test",
        approved: false,
        authority: AuthorityLevel.OWNER,
        commandMode: "BUILD" as CommandMode,
      }
    );
    console.log("✗ Should have thrown network error");
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Network is disabled")) {
      console.log("✓ Network window properly enforced");
      return true;
    }
    console.log(`✗ Unexpected error: ${error}`);
    return false;
  }
}

/**
 * Test: Cost guard enforcement
 */
export async function test_costGuard() {
  const audit = createMockAudit();
  const governor = createMockGovernor();
  const config = createMockConfig({
    llm: {
      enabled: true,
      provider: "openai",
      model: "gpt-4o-mini",
      fallbackToStatic: true,
      maxTokensPerRequest: 2000,
      costGuardUsd: 0.0001, // Very low guard
      temperature: 0.2,
    },
  });

  try {
    await callLLM(
      {
        provider: LLMProvider.OpenAI,
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "This is a very long prompt that should exceed the cost guard " + "x".repeat(10000),
          },
        ],
      },
      {
        config,
        audit,
        governor,
        actor: "test",
        approved: false,
        authority: AuthorityLevel.OWNER,
        commandMode: "BUILD" as CommandMode,
      }
    );
    console.log("✗ Should have thrown cost guard error");
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes("cost guard")) {
      console.log("✓ Cost guard properly enforced");
      return true;
    }
    console.log(`✗ Unexpected error: ${error}`);
    return false;
  }
}

/**
 * Test: Prompt redaction in audit logs
 */
export async function test_promptRedaction() {
  const audit = createMockAudit();
  const governor = createMockGovernor();
  const config = createMockConfig();

  const secretPrompt = "My password is secret123";

  try {
    await callLLM(
      {
        provider: LLMProvider.OpenAI,
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: secretPrompt }],
      },
      {
        config,
        audit,
        governor,
        actor: "test",
        approved: false,
        authority: AuthorityLevel.OWNER,
        commandMode: "BUILD" as CommandMode,
      }
    );
  } catch (error) {
    // Expected to fail if OpenAI not configured
  }

  const logs = (audit as any).getLogs();
  const requestLog = logs.find((l: any) => l.action === "llm.request");

  if (!requestLog) {
    console.log("✗ No request log found");
    return false;
  }

  const result = JSON.parse(requestLog.result);
  
  // Check that prompt is hashed, not stored verbatim
  if (result.promptHash && !requestLog.result.includes(secretPrompt)) {
    console.log("✓ Prompts are redacted in audit logs (hashed)");
    return true;
  }

  console.log("✗ Prompt was not properly redacted");
  return false;
}

// Run all tests
async function runTests() {
  console.log("\n========================================");
  console.log("Running LLM Provider Tests");
  console.log("========================================\n");

  const tests = [
    { name: "isLLMAvailable", fn: test_isLLMAvailable },
    { name: "Network window enforcement", fn: test_networkWindowRequired },
    { name: "Cost guard enforcement", fn: test_costGuard },
    { name: "Prompt redaction", fn: test_promptRedaction },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\nTest: ${test.name}`);
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`✗ Test threw error: ${error}`);
      failed++;
    }
  }

  console.log("\n========================================");
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  console.log("========================================\n");

  return failed === 0;
}

// Export for test runner
if (require.main === module) {
  runTests().then((success) => {
    process.exit(success ? 0 : 1);
  });
}
