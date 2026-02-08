# Adversarial Stress Tests (Phase 1)

Each scenario lists the expected response, prevention mechanism, and audit log
location. All actions must be audited (append-only).

1) **Path traversal (`../`) on read**
- Expected: request denied.
- Prevention: relative-only paths + rootDir boundary checks + realpath enforcement.
- Audit: `read_file` event with `DENIED` result.

2) **Path traversal (`../`) on write**
- Expected: request denied.
- Prevention: relative-only paths + rootDir boundary checks + realpath enforcement.
- Audit: `write_file` event with `DENIED` result.

3) **Symlink escape on read**
- Expected: request denied.
- Prevention: canonical (realpath) checks against rootDir.
- Audit: `read_file` event with `DENIED` result.

4) **Symlink escape on write**
- Expected: request denied.
- Prevention: canonical (realpath) checks against rootDir.
- Audit: `write_file` event with `DENIED` result.

5) **Denylist bypass via nested `.git/`**
- Expected: request denied.
- Prevention: denylist match on any path segment.
- Audit: `read_file`/`write_file` event with `DENIED` result.

6) **Denylist bypass via `.env` or `.env.*`**
- Expected: request denied.
- Prevention: denylist match on any path segment.
- Audit: `read_file`/`write_file` event with `DENIED` result.

7) **Attempt to write governance/specs**
- Expected: request denied.
- Prevention: denylist enforcement for `governance` and `specs`.
- Audit: `write_file` event with `DENIED` result.

8) **Attempt to overwrite root config files**
- Expected: request denied.
- Prevention: root file denylist (`package.json`, `tsconfig.json`,
  `safa.config.json`, `README.md`).
- Audit: `write_file` event with `DENIED` result.

9) **Approval bypass (no `--approve`)**
- Expected: request denied.
- Prevention: governor strict approval mode.
- Audit: skill audit event with `DENIED: Approval required` result.

10) **Attempt to execute non-local skill**
- Expected: request denied.
- Prevention: operator blocks non-local categories.
- Audit: `operator.step` event with `DENIED` result.

11) **Audit log tampering attempt**
- Expected: request denied (or no write access).
- Prevention: denylist + allowlist enforcement (logs are outside allowlist).
- Audit: `write_file` event with `DENIED` result.

12) **Kill switch not honored by outbound action**
- Expected: request denied.
- Prevention: governor kill switch blocks outbound categories.
- Audit: skill audit event with `DENIED: Kill switch enabled` result.
