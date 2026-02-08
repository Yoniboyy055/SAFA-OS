export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runWithArgs } = require("../src/cli/index");

async function runCli(args: string[]) {
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

test("missing mode fails for governed run", async () => {
  const result = await runCli([
    "run",
    "read_file",
    "--input",
    '{"path":"README.md"}',
    "--authority",
    "OWNER"
  ]);
  assert.equal(result.exitCode, 1);
  assert.ok(result.errors.join("\n").includes("Command mode is required"));
});

test("missing authority fails for governed run", async () => {
  const result = await runCli([
    "run",
    "read_file",
    "--input",
    '{"path":"README.md"}',
    "--mode",
    "SCRIPT"
  ]);
  assert.equal(result.exitCode, 1);
  assert.ok(result.errors.join("\n").includes("Owner authority is required"));
});

test("missing approve fails for HIGH skill", async () => {
  const result = await runCli([
    "run",
    "request_web_build",
    "--input",
    '{"projectName":"demo","description":"site"}',
    "--mode",
    "SCRIPT",
    "--authority",
    "OWNER"
  ]);
  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join("\n"), /strict approval/i);
});

test("kill switch blocks run_packet even if execution enabled", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-gates-"));
  const configPath = path.join(rootDir, "safa.config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        killSwitch: { enabled: true },
        execution: {
          enabled: true,
          allowCommands: ["echo"],
          maxRuntimeMs: 1000,
          allowlistPaths: [path.join(rootDir, "data")]
        }
      },
      null,
      2
    )
  );
  const result = await runCli([
    "run",
    "run_packet",
    "--input",
      JSON.stringify({ path: path.join(rootDir, "data", "packet.json") }),
    "--mode",
    "SCRIPT",
    "--authority",
    "OWNER",
    "--approve",
    "--config",
    configPath
  ]);
  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join("\n"), /kill switch/i);
});
