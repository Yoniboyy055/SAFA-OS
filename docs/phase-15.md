# Phase 15 — Real Network

## Scope
- Explicit network enable
- Scoped time windows
- Emergency rollback
- Live provider adapters

## Status
ACTIVE. Live network requires explicit enablement:
- `safa.config.json` network enabled + allowlists
- network window opened (`net:open` or `activateNetworkWindow`)
- `SAFA_NETWORK_LIVE=1` for real I/O

Emergency rollback: close the window via `net:close`.

Allowlist helper:
- `registerLiveProvider` updates allowlist domains/URLs in config.
