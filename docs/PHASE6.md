# Phase 6 — Hardening (Local-Only, Offline)

Phase 6 focuses on hardening and deployment readiness while staying offline.

## Hardening scope
- **Config validation**
  - Required fields when enabling providers
  - Network allowlists required when network enabled
  - Audit log path locked inside `logs/`
- **Audit robustness**
  - Redaction covers Authorization/Bearer/cookie/token/secret
  - Append-only, immutable log
- **Corridor + approvals gates**
  - HIGH-risk skills require `--mode`, `--authority OWNER`, `--approve`
  - Kill switch denies outbound + execution runner
- **Test discovery**
  - Explicit test runner enumerates `dist/tests/**/*.test.js`

## Deployment (local-only)
- Dashboard binds to `127.0.0.1`
- Remote access only via owner-controlled VPN/tunnel (documented only)
- No direct public exposure

