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
- Email (transactional + negotiation): allowlisted SMTP host + allowlisted recipients.
- Stripe payments (request-only): allowlisted prices/amounts + approval.
- Phone calls (dial + intent, no auto-speech): allowlisted numbers + approval.
- Future modules (social/stores): only after explicit approval, tests, and
  allowlist + audit coverage.

## Approval Tiers
- **Per-request**: each outbound action is explicitly approved.
- **Plan-hash (future)**: approve a plan digest once, execute matching steps.

## Email Module (Implemented)
Preview (dry-run, no send):
```
node dist/cli/index.js email:preview --input '{"to":"a@allow.com","subject":"Hello","body":"Draft body"}'
```

Send for real (requires approval + allowlists):
```
node dist/cli/index.js email:send --approve --input '{"to":"a@allow.com","subject":"Hello","body":"Live body","dryRun":false}'
```

## Stripe Payment Requests (Implemented, Live in Phase 4)
Preview:
```
node dist/cli/index.js payment:preview --input '{"priceId":"price_basic","currency":"usd","customerEmail":"user@allow.com"}'
```

Request (approval required):
```
node dist/cli/index.js payment:request --approve --input '{"priceId":"price_basic","currency":"usd","customerEmail":"user@allow.com","dryRun":false}'
```
Note: real Stripe API calls are enabled in Phase 4 with strict gates.

## Phone Calls (Implemented, Live in Phase 4)
Preview:
```
node dist/cli/index.js call:preview --input '{"toNumber":"+15550002222","intent":"sales","dryRun":true}'
```

Request (approval required):
```
node dist/cli/index.js call:make --approve --input '{"toNumber":"+15550002222","intent":"sales","dryRun":false}'
```
Note: provider integration is enabled in Phase 4 with strict gates.

## Future Command Shapes (Not Implemented Yet)
These are **spec-only** and must not be enabled without allowlists, kill switch,
audit, dry-run, and tests.

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

### store_product_upsert
- Category: external_tool (HIGH)
- Requires: allowlisted stores + approval + audit + dry-run
```
jarvis store:product_upsert --store "shop123" --sku "SKU-1" --title "..." --approve
```
