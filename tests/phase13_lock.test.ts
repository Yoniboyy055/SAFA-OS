export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AuditLogger } = require("../src/core/audit");
const { Governor } = require("../src/core/governor");
const { AuthorityLevel } = require("../src/core/authority");
const {
  runClientIntake,
  runNegotiationFlow,
  runFollowUpFlow,
  runRecommendationRequest
} = require("../src/core/phase13/locked");
const { withTestCommandContext } = require("./helpers/command_context");

function buildContext(rootDir: string) {
  const config = {
    network: {
      enabled: false,
      allowlist: [],
      allowlistDomains: [],
      allowlistUrls: [],
      timeoutMs: 10000,
      maxBytes: 200000
    },
    telemetry: { enabled: false },
    killSwitch: { enabled: false },
    governance: {
      strictApprovalMode: false,
      networkApprovalMode: "per_request",
      maxNetworkPayloadBytes: 16384
    },
    email: {
      enabled: false,
      provider: "smtp",
      fromAllowlist: [],
      toAllowlist: [],
      domainAllowlist: [],
      dryRunDefault: true,
      from: "",
      smtp: { host: "smtp.gmail.com", port: 587, secure: false }
    },
    stripe: {
      enabled: false,
      dryRunDefault: true,
      apiBase: "https://api.stripe.com",
      mode: "production",
      statementDescriptor: "SIGNALCRYPT",
      successUrl: "",
      cancelUrl: ""
    },
    calls: {
      enabled: false,
      provider: "twilio",
      fromNumberAllowlist: [],
      toNumberAllowlist: [],
      countryAllowlist: [],
      twimlUrl: "",
      recordCalls: false,
      dryRunDefault: true
    },
    execution: {
      enabled: false,
      allowCommands: [],
      maxRuntimeMs: 600000,
      allowlistPaths: [path.join(rootDir, "data")]
    },
    audit: { logPath: path.join(rootDir, "logs", "audit.log"), redactKeys: [] },
    permissions: {
      writeAllowlist: [path.join(rootDir, "data")],
      readAllowlist: [path.join(rootDir, "data")],
      stripePriceAllowlist: [],
      stripeAmountAllowlist: [],
      stripeCurrencyAllowlist: ["usd"],
      stripeCustomerEmailAllowlist: [],
      emailSubjectAllowlist: [],
      emailTemplateAllowlist: [],
      callIntentAllowlist: ["sales", "support", "follow_up", "payment"],
      callTemplateAllowlist: []
    },
    rootDir,
    configPath: path.join(rootDir, "safa.config.json")
  };
  return {
    actor: "tester",
    approved: true,
    authority: AuthorityLevel.OWNER,
    commandMode: "SCRIPT",
    config,
    audit: new AuditLogger({ logPath: config.audit.logPath, redactKeys: [] }),
    governor: new Governor()
  };
}

test("phase 13 business ops flows run with approval", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-phase13-"));
  const context = buildContext(rootDir);
  await withTestCommandContext(context.actor, async () => {
    const intake = await runClientIntake(
      { clientName: "Acme", projectType: "roadmap" },
      context
    );
    assert.equal(intake.success, true);

    const negotiation = await runNegotiationFlow(
      { clientName: "Acme", targetOutcome: "Retainer" },
      context
    );
    assert.equal(negotiation.success, true);

    const followUp = await runFollowUpFlow(
      { clientName: "Acme", context: "Proposal follow-up" },
      context
    );
    assert.equal(followUp.success, true);

    const recommendation = await runRecommendationRequest(
      { recipientName: "Jordan", relationship: "project" },
      context
    );
    assert.equal(recommendation.success, true);
  });
});
