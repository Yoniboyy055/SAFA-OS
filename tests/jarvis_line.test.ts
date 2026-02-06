export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseJarvisLine } = require("../src/cli/jarvis_line");
const { runWithArgs } = require("../src/cli/index");

async function runLine(args: string[]) {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...items) => logs.push(items.join(" "));
  console.error = (...items) => errors.push(items.join(" "));
  let exitCode = 0;
  try {
    await runWithArgs(args, {
      exit: (code: number) => {
        exitCode = code;
      }
    });
  } catch (error) {
    if (!String(error).includes("__EXIT__")) {
      throw error;
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { logs, errors, exitCode };
}

test("parse RUN with JSON and flags", () => {
  const argv = parseJarvisLine(
    'JARVIS: RUN read_file {"path":"README.md"} --dry-run --explain'
  );
  assert.equal(argv[0], "run");
  assert.equal(argv[1], "read_file");
  const inputIndex = argv.indexOf("--input");
  assert.ok(inputIndex >= 0);
  const input = JSON.parse(argv[inputIndex + 1]);
  assert.equal(input.path, "README.md");
  assert.equal(input.dryRun, true);
  assert.equal(input.explain, true);
  assert.ok(argv.includes("--mode"));
  assert.ok(argv.includes("--authority"));
});

test("invalid JSON fails closed", () => {
  assert.throws(
    () => parseJarvisLine("JARVIS: RUN read_file {bad"),
    /Invalid JSON|Unterminated JSON/i
  );
});

test("jarvis line --text lists skills and status", async () => {
  const skills = await runLine(["line", "--text", "JARVIS: SKILLS"]);
  assert.equal(skills.exitCode, 0);
  assert.ok(skills.logs.join("\n").includes("read_file"));

  const status = await runLine(["line", "--text", "JARVIS: STATUS"]);
  assert.equal(status.exitCode, 0);
  const parsed = JSON.parse(status.logs.join("\n"));
  assert.equal(parsed.networkEnabled, false);
});

test("JARVIS RUN write_file creates approval ticket and does not execute", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-line-"));
  const configPath = path.join(rootDir, "jarvis.config.json");
  fs.writeFileSync(configPath, "{}", "utf8");
  const result = await runLine([
    "line",
    "--text",
    'JARVIS: RUN write_file {"path":"data/line.txt","content":"hi"}',
    "--config",
    configPath
  ]);
  assert.equal(result.exitCode, 1);
  const approvalPath = path.join(rootDir, "data", "approvals.json");
  assert.ok(fs.existsSync(approvalPath));
  const approvals = JSON.parse(fs.readFileSync(approvalPath, "utf8"));
  assert.ok(Array.isArray(approvals));
  assert.ok(approvals.length > 0);
  assert.ok(!fs.existsSync(path.join(rootDir, "data", "line.txt")));

  const auditPath = path.join(rootDir, "logs", "audit.log");
  const auditLog = fs.readFileSync(auditPath, "utf8");
  assert.ok(auditLog.includes("jarvis_line"));
  assert.ok(!auditLog.includes("data/line.txt"));
});
