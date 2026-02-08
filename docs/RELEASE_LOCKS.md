# Release Locks (Governance)

Release locks are governance-only gates that block non-local categories even
when approvals exist. They are intended to prevent accidental activation of
high-risk capabilities during development.

## Defaults
- Disabled by default.
- Suggested block list: network, outbound_message, external_tool.

## Config
Example in `jarvis.config.json`:
```
"releaseLock": {
  "enabled": true,
  "blockedCategories": ["network", "outbound_message", "external_tool"]
}
```

## Behavior
When enabled, the governor denies actions in the blocked categories and logs a
`release_lock.triggered` audit event.

## Notes
- Release lock is separate from kill switch and approval gates.
- Keep it enabled during local development and tests for safety.
