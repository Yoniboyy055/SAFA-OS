# Phone Calls (Governed, Request-Only)

This module requests outbound calls with strict approvals and allowlists. It
does not perform auto-speech or autonomous calling.

## Safety Principles
- Approval is always required for real calls.
- Dry-run previews are supported.
- Kill switch blocks all outbound calls.

## Required Allowlists
- `calls.fromNumberAllowlist`
- `calls.toNumberAllowlist`
- `calls.countryAllowlist`
- `permissions.callIntentAllowlist`
- `network.allowlistDomains` must include provider domains for real calls.

## CLI Examples
Preview:
```
node dist/cli/index.js call:preview --input '{"toNumber":"+15550002222","intent":"sales","dryRun":true}'
```

Request (real, approval required):
```
node dist/cli/index.js call:make --approve --input '{"toNumber":"+15550002222","intent":"sales","dryRun":false}'
```

## Notes
- No auto-speech is permitted without explicit approval.
- Call requests are stubbed until Phase 4 provider integration.
