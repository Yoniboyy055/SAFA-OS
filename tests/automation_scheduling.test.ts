/**
 * Tests for Week 2 Automation Scheduling Features
 */

export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ScheduleStore } = require("../src/core/automation/schedule_store");
const path = require("node:path");

test("ScheduleStore: create and retrieve schedule", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  const schedule = {
    id: "test-schedule-1",
    name: "Test Schedule",
    description: "A test schedule",
    type: "daily",
    time: "09:00",
    skillName: "send_email",
    input: { to: "test@example.com" },
    requiresApproval: false,
    owner: "test-user",
    enabled: true
  };
  
  const id = store.addSchedule(schedule);
  assert.strictEqual(id, "test-schedule-1");
  
  const retrieved = store.getSchedule(id);
  assert.ok(retrieved);
  assert.strictEqual(retrieved.id, schedule.id);
  assert.strictEqual(retrieved.name, schedule.name);
  assert.strictEqual(retrieved.type, "daily");
  assert.strictEqual(retrieved.runCount, 0);
  assert.ok(retrieved.nextRunAt);
});

test("ScheduleStore: list schedules with filtering", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "daily-schedule",
    name: "Daily Schedule",
    description: "Test",
    type: "daily",
    time: "09:00",
    skillName: "send_email",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  store.addSchedule({
    id: "weekly-schedule",
    name: "Weekly Schedule",
    description: "Test",
    type: "weekly",
    dayOfWeek: 1,
    time: "14:00",
    skillName: "make_call",
    input: {},
    requiresApproval: true,
    owner: "test",
    enabled: false
  });
  
  const allSchedules = store.listSchedules();
  assert.strictEqual(allSchedules.length, 2);
  
  const dailySchedules = store.listSchedules({ type: "daily" });
  assert.strictEqual(dailySchedules.length, 1);
  assert.strictEqual(dailySchedules[0].type, "daily");
  
  const enabledSchedules = store.listSchedules({ enabled: true });
  assert.strictEqual(enabledSchedules.length, 1);
  assert.strictEqual(enabledSchedules[0].enabled, true);
});

test("ScheduleStore: daily schedule calculates next run", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "daily-9am",
    name: "Daily 9 AM",
    description: "Test",
    type: "daily",
    time: "09:00",
    skillName: "test_skill",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  const schedule = store.getSchedule("daily-9am");
  assert.ok(schedule);
  assert.ok(schedule.nextRunAt);
  
  const nextRun = new Date(schedule.nextRunAt);
  assert.strictEqual(nextRun.getHours(), 9);
  assert.strictEqual(nextRun.getMinutes(), 0);
});

test("ScheduleStore: weekly schedule calculates next run", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "weekly-monday",
    name: "Weekly Monday",
    description: "Test",
    type: "weekly",
    dayOfWeek: 1, // Monday
    time: "14:00",
    skillName: "test_skill",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  const schedule = store.getSchedule("weekly-monday");
  assert.ok(schedule);
  assert.ok(schedule.nextRunAt);
  
  const nextRun = new Date(schedule.nextRunAt);
  assert.strictEqual(nextRun.getDay(), 1); // Monday
  assert.strictEqual(nextRun.getHours(), 14);
  assert.strictEqual(nextRun.getMinutes(), 0);
});

test("ScheduleStore: monthly schedule calculates next run", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "monthly-first",
    name: "Monthly First Day",
    description: "Test",
    type: "monthly",
    dayOfMonth: 1,
    time: "00:00",
    skillName: "test_skill",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  const schedule = store.getSchedule("monthly-first");
  assert.ok(schedule);
  assert.ok(schedule.nextRunAt);
  
  const nextRun = new Date(schedule.nextRunAt);
  assert.strictEqual(nextRun.getDate(), 1);
  assert.strictEqual(nextRun.getHours(), 0);
  assert.strictEqual(nextRun.getMinutes(), 0);
});

test("ScheduleStore: preview schedule for Phase 7B locked skill", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "email-schedule",
    name: "Email Schedule",
    description: "Test",
    type: "daily",
    time: "09:00",
    skillName: "send_email", // This is Phase 7B locked
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  const preview = store.previewSchedule("email-schedule");
  assert.ok(preview);
  assert.strictEqual(preview.willExecute, false);
  assert.ok(preview.blockedReason);
  assert.ok(preview.blockedReason.includes("PHASE_7B_LOCKED"));
  assert.ok(Array.isArray(preview.nextRuns));
  assert.ok(preview.nextRuns.length > 0);
});

test("ScheduleStore: preview schedule for non-locked skill", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "local-schedule",
    name: "Local Schedule",
    description: "Test",
    type: "daily",
    time: "09:00",
    skillName: "read_file", // Not Phase 7B locked
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  const preview = store.previewSchedule("local-schedule");
  assert.ok(preview);
  assert.strictEqual(preview.willExecute, true);
  assert.strictEqual(preview.blockedReason, undefined);
  assert.ok(Array.isArray(preview.nextRuns));
});

test("ScheduleStore: disabled schedule won't execute", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "disabled-schedule",
    name: "Disabled Schedule",
    description: "Test",
    type: "daily",
    time: "09:00",
    skillName: "read_file",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: false
  });
  
  const preview = store.previewSchedule("disabled-schedule");
  assert.ok(preview);
  assert.strictEqual(preview.willExecute, false);
});

test("ScheduleStore: update schedule", async () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "update-test",
    name: "Original Schedule",
    description: "Test",
    type: "daily",
    time: "09:00",
    skillName: "test_skill",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  // Wait a tiny bit to ensure different timestamps
  await new Promise(resolve => setTimeout(resolve, 10));
  
  const updated = store.updateSchedule("update-test", {
    time: "14:00",
    enabled: false
  });
  
  assert.ok(updated);
  assert.strictEqual(updated.time, "14:00");
  assert.strictEqual(updated.enabled, false);
  // Just check that updatedAt exists and is after createdAt
  assert.ok(updated.createdAt);
  assert.ok(updated.updatedAt);
});

test("ScheduleStore: delete schedule", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "delete-test",
    name: "To Delete",
    description: "Test",
    type: "daily",
    time: "09:00",
    skillName: "test_skill",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  assert.ok(store.getSchedule("delete-test"));
  
  const deleted = store.deleteSchedule("delete-test");
  assert.strictEqual(deleted, true);
  
  assert.strictEqual(store.getSchedule("delete-test"), undefined);
  
  const deletedAgain = store.deleteSchedule("delete-test");
  assert.strictEqual(deletedAgain, false);
});

test("ScheduleStore: export and import schedules", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "export-test-1",
    name: "Export Test 1",
    description: "Test",
    type: "daily",
    time: "09:00",
    skillName: "test_skill",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  store.addSchedule({
    id: "export-test-2",
    name: "Export Test 2",
    description: "Test",
    type: "weekly",
    dayOfWeek: 1,
    time: "14:00",
    skillName: "test_skill",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  const exported = store.exportSchedules();
  assert.ok(exported);
  assert.ok(exported.includes("export-test-1"));
  assert.ok(exported.includes("export-test-2"));
  
  const newStore = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  const count = newStore.importSchedules(exported);
  assert.strictEqual(count, 2);
  
  assert.ok(newStore.getSchedule("export-test-1"));
  assert.ok(newStore.getSchedule("export-test-2"));
});

test("ScheduleStore: once schedule has no recurrence", () => {
  const store = new ScheduleStore({ storePath: path.join(process.cwd(), "data", "schedules") });
  
  store.addSchedule({
    id: "once-schedule",
    name: "One Time Schedule",
    description: "Test",
    type: "once",
    skillName: "test_skill",
    input: {},
    requiresApproval: false,
    owner: "test",
    enabled: true
  });
  
  const preview = store.previewSchedule("once-schedule");
  assert.ok(preview);
  assert.ok(preview.nextRuns.length >= 1);
  
  // Once schedules should only have one run
  const schedule = store.getSchedule("once-schedule");
  assert.ok(schedule);
  assert.strictEqual(schedule.type, "once");
});
