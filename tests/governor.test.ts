const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Governor } = require("../src/core/governor");

const baseConfig = {
  network: { enabled: false, allowlist: [] },
  telemetry: { enabled: false },
  killSwitch: { enabled: false },
  audit: { logPath: "/tmp/audit.log", redactKeys: [] },
  permissions: { writeAllowlist: [] },
  rootDir: "/tmp",
  configPath: "/tmp/jarvis.config.json"
};

test("governor blocks outbound when kill switch enabled", () => {
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "network_call",
      category: "network",
      riskLevel: "LOW",
      requiresApproval: false,
      allowWhenNetworkOff: false
    },
    { ...baseConfig, killSwitch: { enabled: true } },
    { actor: "tester", approved: true }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /kill switch/i);
});

test("governor requires approval for risky actions", () => {
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "write_file",
      category: "local",
      riskLevel: "HIGH",
      requiresApproval: false,
      allowWhenNetworkOff: true
    },
    baseConfig,
    { actor: "tester", approved: false }
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /approval required/i);
});

test("governor allows low-risk local actions", () => {
  const governor = new Governor();
  const decision = governor.evaluate(
    {
      type: "list_files",
      category: "local",
      riskLevel: "LOW",
      requiresApproval: false,
      allowWhenNetworkOff: true
    },
    baseConfig,
    { actor: "tester", approved: false }
  );
  assert.equal(decision.allowed, true);
});
