const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function collectTests(dir, results) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTests(entryPath, results);
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      results.push(entryPath);
    }
  }
}

const root = path.resolve(__dirname, "..");
const testRoot = path.join(root, "dist", "tests");
const tests = [];
collectTests(testRoot, tests);

if (tests.length === 0) {
  console.error("No tests found under dist/tests.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit"
});
process.exit(result.status ?? 1);
