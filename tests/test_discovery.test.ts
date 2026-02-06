export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("compiled tests are discoverable", () => {
  const testDir = path.resolve(__dirname);
  const files = fs
    .readdirSync(testDir)
    .filter((file: string) => file.endsWith(".test.js"));
  assert.ok(files.length > 0);
});
