# Phase 3 — Full Power (Governed)

Phase 3 enables powerful outbound capabilities **only** through strict
governance controls: approvals, allowlists, kill switch, audit logging, and
dry-run defaults. Network access remains OFF by default.

## What “Full Power (Governed)” Means
- **Strict approvals**: `strictApprovalMode=true` requires explicit approval.
- **Allowlists**: outbound targets must be allowlisted (domains, recipients).
- **Kill switch**: outbound actions are blocked when enabled.
- **Audit-first**: append-only logs with redaction.
- **Dry-run + queue**: preview and queue by default, send only with approval.

## Capability Unlock by Domain
- Email (SMTP): allowlisted SMTP host + allowlisted recipients.
- Future modules (calls/payments/social): only after explicit approval, tests,
  and allowlist + audit coverage.

## Approval Tiers
- **Per-request**: each outbound action is explicitly approved.
- **Plan-hash (future)**: approve a plan digest once, execute matching steps.

## Email Module (Implemented)
Queue draft (dry-run, no send):
```
node dist/cli/index.js email:queue --input '{"to":["a@allow.com"],"subject":"Hello","text":"Draft body"}'
```
Note: when strict approval mode is enabled, add `--approve`.

Dry-run via skill (explicit approval still required when strict mode on):
```
node dist/cli/index.js run send_email --approve --input '{"to":"a@allow.com","subject":"Hello","text":"Draft body","dryRun":true}'
```

Send for real (requires approval + allowlists):
```
node dist/cli/index.js email:send --approve --input '{"to":"a@allow.com","subject":"Hello","text":"Live body","dryRun":false}'
```

## Future Command Shapes (Not Implemented Yet)
These are **spec-only** and must not be enabled without allowlists, kill switch,
audit, dry-run, and tests.

### place_call
- Category: external_tool (HIGH)
- Requires: allowlisted numbers + approval + kill switch + audit + dry-run
```
jarvis call --number "+15551234567" --purpose "..." --approve
```

### request_payment
- Category: external_tool (HIGH)
- Requires: allowlisted recipients + approval + audit + dry-run
```
jarvis payment:request --to "user@allow.com" --amount "100.00" --currency "USD" --approve
```

### request_review
- Category: outbound_message (MEDIUM/HIGH)
- Requires: allowlisted recipients + approval + audit + dry-run
```
jarvis review:request --to "user@allow.com" --template "..." --approve
```

### publish_post
- Category: outbound_message or external_tool (HIGH)
- Requires: allowlisted accounts + approval + audit + dry-run
```
jarvis post:publish --channel "x.com" --content "..." --approve
```
