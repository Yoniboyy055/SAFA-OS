export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const resolver = require(path.join(
  process.cwd(),
  "dashboard",
  "intent_resolver.js"
));

test("intent resolver maps run tests", () => {
  const intent = resolver.resolveIntent("run tests");
  assert.equal(intent.type, "run_skill");
  assert.equal(intent.skill, "run_tests");
});

test("intent resolver maps approvals panel", () => {
  const intent = resolver.resolveIntent("show approvals");
  assert.equal(intent.type, "panel");
  assert.equal(intent.panel, "approvals");
});

test("intent resolver maps execute", () => {
  const intent = resolver.resolveIntent("execute it");
  assert.equal(intent.type, "exec");
});

test("intent resolver defaults to plan", () => {
  const intent = resolver.resolveIntent("draft a recap");
  assert.equal(intent.type, "plan");
});

test("presence greeting uses time of day", () => {
  const morning = new Date("2026-02-07T09:00:00.000Z");
  const presence = resolver.buildPresence(morning, "YG");
  assert.ok(presence.greeting.toLowerCase().includes("good"));
});
