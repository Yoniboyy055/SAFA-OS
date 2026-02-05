# Security Model (Defaults)

This document summarizes the default allowlists and the global deny list for
local file access. GOVERNOR.md remains supreme law.

## Default Allowlists

| Action | Allowed Paths (relative to config root) |
| ------ | --------------------------------------- |
| Read   | `data`, `workspace`, `docs`             |
| Write  | `workspace`, `data`                     |

## Global Deny List (Always Deny)

The following paths are always denied for both read and write attempts:
- `governance`
- `specs`
- `.git`
- `.env`
- `.env.*`
- `node_modules`

These denylists are enforced before allowlists and apply to both the requested
path and the canonical (realpath) target.
