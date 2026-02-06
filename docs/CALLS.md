# Phone Calls (Governed, Request-Only)

This module requests outbound calls with strict approvals and allowlists. It
does not perform auto-speech or autonomous calling. **Live calls are disabled
in Phase 3.**

## Safety Principles
- Real calls are blocked in Phase 3 (preview only).
- Dry-run previews are supported.
- Kill switch blocks all outbound calls.

## Required Allowlists
- `calls.fromNumberAllowlist`
- `calls.toNumberAllowlist`
- `calls.countryAllowlist`
- `permissions.callIntentAllowlist`
- `network.allowlistDomains` must include provider domains for real calls
  (not permitted under current policy).

## CLI Examples
Preview:
```
node dist/cli/index.js call:preview --input '{"toNumber":"+15550002222","intent":"sales","dryRun":true}'
```

Request (blocked in Phase 3):
```
node dist/cli/index.js call:make --approve --input '{"toNumber":"+15550002222","intent":"sales","dryRun":false}'
```

## Notes
- No auto-speech is permitted without explicit approval.

## Live Outbound (Not Permitted)
Live calls are disabled under the current policy set.
