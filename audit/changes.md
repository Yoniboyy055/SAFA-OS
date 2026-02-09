# Audit Changes Log

## 2026-02-08 - Gate H Constitution Lock
- Gate H added with constitution artifacts and boot-time verification.
- Files added/updated:
  - governor/constitution.md
  - governor/constitution.sha256
  - governor/verifyConstitution.ts
  - scripts/hashConstitution.ts
  - tests/governor/verifyConstitution.test.ts
  - src/cli/index.ts
  - src/dashboard/server.ts
  - src/daemon/daemon.ts
  - package.json
- Behavior: startup halts if the constitution is missing, hash is missing, or hash mismatches.
- Regenerate hash: npm run constitution:hash
b00a55e062a1c8287eadcfc8ebb0d6dcfddc6f2a
