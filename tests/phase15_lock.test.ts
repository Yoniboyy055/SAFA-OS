export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  activateNetworkWindow,
  registerLiveProvider
} = require("../src/core/phase15/locked");

test("phase 15 network window activation writes state", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-phase15-"));
  const state = activateNetworkWindow(rootDir, 6, "owner");
  assert.equal(state.enabled, true);
  assert.ok(state.startAt);
  assert.ok(state.endAt);
  assert.equal(state.openedBy, "owner");
});

test("phase 15 registerLiveProvider updates config allowlists", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-phase15-"));
  const configPath = path.join(rootDir, "safa.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({ network: { allowlistDomains: [], allowlistUrls: [] } }, null, 2),
    "utf8"
  );
  const result = registerLiveProvider({
    configPath,
    domains: ["api.openai.com"],
    urls: ["https://api.openai.com/v1/chat/completions"]
  });
  assert.ok(result.allowlistDomains.includes("api.openai.com"));
  assert.ok(result.allowlistUrls.includes("https://api.openai.com/v1/chat/completions"));
  const updated = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.ok(updated.network.allowlistDomains.includes("api.openai.com"));
});
