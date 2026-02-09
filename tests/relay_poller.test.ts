export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJob, getJob } = require("../src/core/job_store");

const { startRelayPoller } = require("../src/relay/relay_poller");

test("relay poller module exports startRelayPoller", () => {
  assert.equal(typeof startRelayPoller, "function");
});
