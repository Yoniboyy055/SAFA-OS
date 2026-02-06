# Build Environment Policy (Governance Clarification)

This document clarifies build-time allowances only. Runtime policy remains
unchanged: NETWORK is OFF by default and must not be enabled without explicit
approval per GOVERNOR.md.

## Runtime Policy (Unchanged)
- NETWORK: OFF by default.
- TELEMETRY: OFF.
- Kill switch applies to outbound actions.

## Build Environment Policy
- Dependency installation is allowed **only** by a human in a controlled build
  environment.
- CI builds are permitted in a controlled environment for validation.
- Preferred method: `npm ci` (requires a lockfile).
- Postinstall scripts are not allowed unless explicitly reviewed and approved.
- Build actions should be logged manually (or via a separate build log file).

No build-time allowances change runtime enforcement rules.
