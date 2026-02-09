export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AuditLogger } = require("../../src/core/audit");

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function withTempDir(fn: (rootDir: string) => void): void {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "safa-constitution-"));
  fs.mkdirSync(path.join(rootDir, "governor"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "logs"), { recursive: true });
  const nodeProcess = process as unknown as { chdir: (dir: string) => void; cwd: () => string };
  const previous = nodeProcess.cwd();
  nodeProcess.chdir(rootDir);
  try {
    fn(rootDir);
  } finally {
    nodeProcess.chdir(previous);
  }
}

function writeConstitution(rootDir: string, content: string, hashContent?: string): void {
  const governorDir = path.join(rootDir, "governor");
  fs.writeFileSync(path.join(governorDir, "constitution.md"), content, "utf8");
  if (hashContent !== undefined) {
    fs.writeFileSync(
      path.join(governorDir, "constitution.sha256"),
      `${hashValue(hashContent)}\n`,
      "utf8"
    );
  }
}

function buildAudit(rootDir: string): InstanceType<typeof AuditLogger> {
  return new AuditLogger({
    logPath: path.join(rootDir, "logs", "audit.log"),
    redactKeys: []
  });
}

function loadVerifyConstitution(): (audit: InstanceType<typeof AuditLogger>, actor: string) => void {
  const modulePath = require.resolve("../../src/core/constitution");
  delete require.cache[modulePath];
  const { verifyConstitution } = require("../../src/core/constitution");
  return verifyConstitution as (audit: InstanceType<typeof AuditLogger>, actor: string) => void;
}

const BASE_CONSTITUTION = `# SAFA OS Constitution\nVersion: 1.0.0\nDate: 2026-02-08\n`;

test("valid constitution passes", () => {
  withTempDir((rootDir) => {
    writeConstitution(rootDir, BASE_CONSTITUTION, BASE_CONSTITUTION);
    const audit = buildAudit(rootDir);
    const verifyConstitution = loadVerifyConstitution();
    assert.doesNotThrow(() => verifyConstitution(audit, "tester"));
  });
});

test("missing constitution.md fails hard", () => {
  withTempDir((rootDir) => {
    const governorDir = path.join(rootDir, "governor");
    fs.writeFileSync(
      path.join(governorDir, "constitution.sha256"),
      `${hashValue(BASE_CONSTITUTION)}\n`,
      "utf8"
    );
    const audit = buildAudit(rootDir);
    const verifyConstitution = loadVerifyConstitution();
    assert.throws(() => verifyConstitution(audit, "tester"), /missing/i);
  });
});

test("missing constitution.sha256 fails hard", () => {
  withTempDir((rootDir) => {
    writeConstitution(rootDir, BASE_CONSTITUTION, undefined);
    const audit = buildAudit(rootDir);
    const verifyConstitution = loadVerifyConstitution();
    assert.throws(() => verifyConstitution(audit, "tester"), /hash/i);
  });
});

test("modified constitution content fails hard", () => {
  withTempDir((rootDir) => {
    writeConstitution(rootDir, BASE_CONSTITUTION, BASE_CONSTITUTION);
    fs.writeFileSync(
      path.join(rootDir, "governor", "constitution.md"),
      `${BASE_CONSTITUTION}\nTampered.\n`,
      "utf8"
    );
    const audit = buildAudit(rootDir);
    const verifyConstitution = loadVerifyConstitution();
    assert.throws(() => verifyConstitution(audit, "tester"), /mismatch/i);
  });
});

test("malformed hash file fails hard", () => {
  withTempDir((rootDir) => {
    const governorDir = path.join(rootDir, "governor");
    fs.writeFileSync(path.join(governorDir, "constitution.md"), BASE_CONSTITUTION, "utf8");
    fs.writeFileSync(path.join(governorDir, "constitution.sha256"), "not-a-hash", "utf8");
    const audit = buildAudit(rootDir);
    const verifyConstitution = loadVerifyConstitution();
    assert.throws(() => verifyConstitution(audit, "tester"), /hash/i);
  });
});
