export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveTheme } = require("../src/core/theme");

test("theme resolves to freeze when frozen", () => {
  const theme = resolveTheme(
    { killSwitch: { enabled: true }, network: { enabled: false } } as any,
    { enabled: true } as any,
    { enabled: true, armed: false } as any
  );
  assert.equal(theme.id, "freeze");
});

test("theme resolves to safe with kill switch", () => {
  const theme = resolveTheme(
    { killSwitch: { enabled: true }, network: { enabled: false } } as any,
    { enabled: false } as any,
    { enabled: true, armed: false } as any
  );
  assert.equal(theme.id, "safe");
});
