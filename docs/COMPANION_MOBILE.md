# Mobile Companion (Stub)

Status: spec and mock only. No mobile app framework is included.

## Goal
Provide a read-only mobile view into local status with explicit approvals for
any action that crosses the device boundary.

## Current Stub
- No mobile build artifacts.
- No device pairing or relay.
- No push notifications.

## Shipment 9 Web Companion
- Remote web UI at `/phone.html` (VPN-only).
- PIN unlock via `/remote/unlock` (requires `SAFA_OWNER_TOKEN`).
- Remote session key via `/remote/session`.
- Approvals require HMAC signed payloads via `/remote/approve`.
- Requires `SAFA_REMOTE_ENABLED=1` and a private VPN address.

## Future Requirements
- Read-only defaults; any command requires explicit OWNER approval.
- Local-only pairing (VPN or owner-controlled tunnel), no public exposure.
- Respect governance, kill switch, and release lock states.

## Implementation Notes (Placeholder)
- The current stubs live under `src/companion/mobile/` for reference.
