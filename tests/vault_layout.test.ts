export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ensureVaultLayout } = require("../src/core/vault_layout");

test("vault layout creates expected directories", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-vault-"));
  const layout = ensureVaultLayout(rootDir);
  assert.ok(fs.existsSync(layout.dataDir));
  assert.ok(fs.existsSync(layout.memoryDir));
  Object.values(layout.buckets).forEach((dir) => {
    assert.ok(fs.existsSync(dir));
  });
});
