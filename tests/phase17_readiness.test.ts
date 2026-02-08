export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getReadinessReport } = require("../src/core/phase17/readiness");

test("phase 17 readiness is not complete by default", () => {
  const report = getReadinessReport();
  assert.equal(report.ready, false);
  assert.ok(report.missing.length > 0);
});
