# Desktop Companion (Stub)

Status: stub only. This repository does not ship an Electron/Tauri shell.

## Goal
Provide a desktop wrapper for the local dashboard without enabling network
access or bypassing governance.

## Current Stub
- No desktop framework dependency.
- No auto-update or auto-launch.
- No background telemetry.

## Future Shell Requirements
- Must bind only to `127.0.0.1` and launch the local dashboard.
- Must respect kill switch and release lock controls.
- Must not expose secrets, logs, or config outside the local device.

## Implementation Notes (Placeholder)
- A desktop shell would only be approved after an OWNER sign-off.
- The current stubs live under `src/companion/desktop/` for reference.
