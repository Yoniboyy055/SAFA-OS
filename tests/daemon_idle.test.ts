export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const daemonPath = path.join(process.cwd(), "src", "daemon", "daemon.ts");

test("daemon source contains no schedulers or polling loops", () => {
  const source = fs.readFileSync(daemonPath, "utf8");
  assert.equal(/setInterval\(/.test(source), false);
  assert.equal(/setTimeout\(/.test(source), false);
  assert.equal(/setImmediate\(/.test(source), false);
  assert.equal(/runNext\(/.test(source), false);
  assert.equal(/enqueue\(/.test(source), false);
});
