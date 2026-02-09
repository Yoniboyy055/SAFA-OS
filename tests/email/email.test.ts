/**
 * Email Skill Tests
 * 
 * Tests:
 * - Email sending (mocked SMTP)
 * - Allowlist enforcement
 * - Rate limiting (future)
 * - HTML/plaintext rendering
 * - Dry run mode
 */

import { sendEmail } from "../../src/core/email/client";
import type { EmailMessage } from "../../src/core/email/types";
import type { ResolvedConfig } from "../../src/core/config";
import type { AuditLogger } from "../../src/core/audit";
import type { Governor } from "../../src/core/governor";
import { AuthorityLevel } from "../../src/core/authority";
import type { CommandMode } from "../../src/cli/command_mode";

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

// Mock SMTP transport
function createMockTransport() {
  return {
    sendMail: async (options: any) => {
      return {
        messageId: "test-message-id-12345",
        accepted: options.to.split(", "),
        rejected: [],
      };
    },
  };
}

// Mock config
function createMockConfig(overrides?: any): ResolvedConfig {
  return {
    network: {
      enabled: true,
      allowlist: [],
      allowlistDomains: ["smtp.gmail.com"],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000,
    },
    email: {
      enabled: true,
      provider: "smtp",
      fromAllowlist: ["test@example.com", "*@gmail.com"],
      toAllowlist: ["recipient@example.com", "*@testdomain.com"],
      domainAllowlist: ["example.com"],
      dryRunDefault: false,
      from: "test@example.com",
      smtp: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
      },
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
    rootDir: "/tmp/test",
    ...overrides,
  } as ResolvedConfig;
}

/**
 * Test: Dry run mode saves to outbox
 */
export async function test_dryRunMode() {
  const audit = createMockAudit();
  const governor = createMockGovernor();
  const config = createMockConfig();

  const message: EmailMessage = {
    to: ["recipient@example.com"],
    subject: "Test Subject",
    body: "Test body content",
    dryRun: true,
  };

  try {
    const result = await sendEmail(message, {
      config,
      audit,
      governor,
      actor: "test",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "BUILD" as CommandMode,
    });

    if (result.mode === "DRY_RUN" && result.outboxPath) {
      console.log("✓ Dry run mode works correctly");
      return true;
    } else {
      console.log("✗ Dry run mode did not return expected result");
      return false;
    }
  } catch (error) {
    console.log(`✗ Dry run test failed: ${error}`);
    return false;
  }
}

/**
 * Test: Email sending with mocked transport
 */
export async function test_emailSending() {
  const audit = createMockAudit();
  const governor = createMockGovernor();
  const config = createMockConfig();
  const transport = createMockTransport();

  const message: EmailMessage = {
    to: ["recipient@example.com"],
    subject: "Test Subject",
    body: "Test body content",
    dryRun: false,
  };

  try {
    const result = await sendEmail(message, {
      config,
      audit,
      governor,
      actor: "test",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "BUILD" as CommandMode,
      transportOverride: transport,
    });

    if (result.mode === "SENT" && result.messageId) {
      console.log("✓ Email sending works correctly");
      return true;
    } else {
      console.log("✗ Email sending did not return expected result");
      return false;
    }
  } catch (error) {
    console.log(`✗ Email sending test failed: ${error}`);
    return false;
  }
}

/**
 * Test: Allowlist enforcement
 */
export async function test_allowlistEnforcement() {
  const audit = createMockAudit();
  const governor = createMockGovernor();
  const config = createMockConfig();

  const message: EmailMessage = {
    to: ["blocked@blocked.com"], // Not in allowlist
    subject: "Test Subject",
    body: "Test body content",
    dryRun: true,
  };

  try {
    await sendEmail(message, {
      config,
      audit,
      governor,
      actor: "test",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "BUILD" as CommandMode,
    });
    console.log("✗ Should have thrown allowlist error");
    return false;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not allowlisted")) {
      console.log("✓ Allowlist enforcement works correctly");
      return true;
    }
    console.log(`✗ Unexpected error: ${error}`);
    return false;
  }
}

/**
 * Test: HTML/plaintext body handling
 */
export async function test_htmlBody() {
  const audit = createMockAudit();
  const governor = createMockGovernor();
  const config = createMockConfig();
  const transport = createMockTransport();

  const message: EmailMessage = {
    to: ["recipient@example.com"],
    subject: "HTML Test",
    body: "<h1>Hello</h1><p>This is HTML</p>",
    dryRun: false,
  };

  try {
    const result = await sendEmail(message, {
      config,
      audit,
      governor,
      actor: "test",
      approved: true,
      authority: AuthorityLevel.OWNER,
      commandMode: "BUILD" as CommandMode,
      transportOverride: transport,
    });

    if (result.mode === "SENT") {
      console.log("✓ HTML body handling works correctly");
      return true;
    } else {
      console.log("✗ HTML body test did not return expected result");
      return false;
    }
  } catch (error) {
    console.log(`✗ HTML body test failed: ${error}`);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log("\n========================================");
  console.log("Running Email Skill Tests");
  console.log("========================================\n");

  const tests = [
    { name: "Dry run mode", fn: test_dryRunMode },
    { name: "Email sending", fn: test_emailSending },
    { name: "Allowlist enforcement", fn: test_allowlistEnforcement },
    { name: "HTML body handling", fn: test_htmlBody },
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
