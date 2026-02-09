export {};
const {
  withCommandContext,
  withDelegatedJobContext,
  createDelegatedJobToken,
  revokeDelegatedJobToken
} = require("../../src/core/execution_gate");

function withTestCommandContext(actor: string, fn: () => Promise<unknown> | unknown) {
  return withCommandContext(
    {
      id: `test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      actor,
      source: "test",
      command: "test"
    },
    fn
  );
}

module.exports = {
  withTestCommandContext,
  withDelegatedJobContext,
  createDelegatedJobToken,
  revokeDelegatedJobToken
};
