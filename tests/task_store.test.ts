export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { upsertTask, listTasks } = require("../src/core/task_store");

test("task store persists tasks and events", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-tasks-"));
  const task = upsertTask(rootDir, {
    commandText: "Run unit test",
    status: "PLANNED",
    actor: "tester"
  });

  const tasks = listTasks(rootDir);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, task.id);

  const taskPath = path.join(rootDir, "data", "tasks.json");
  const logPath = path.join(rootDir, "data", "tasks.log");
  assert.ok(fs.existsSync(taskPath));
  assert.ok(fs.existsSync(logPath));
  const log = fs.readFileSync(logPath, "utf8");
  assert.ok(log.includes(task.id));
});
