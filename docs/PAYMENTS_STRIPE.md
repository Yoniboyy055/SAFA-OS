# Stripe Payments (Request-Only, Governed)

This module creates **payment requests only**. It does not charge cards or
capture funds directly. All actions are gated by approvals, allowlists, and the
kill switch. Network is OFF by default and **live Stripe is disabled in Phase 3**.

## Safety Principles
- No mass outreach or automated billing.
- Dry-run preview is supported for every request.
- Real requests are blocked in Phase 3 (preview only).
- All actions are audited with redaction (no secrets logged).

## Required Allowlists
- `permissions.stripePriceAllowlist`
- `permissions.stripeAmountAllowlist`
- `permissions.stripeCurrencyAllowlist`
- `permissions.stripeCustomerEmailAllowlist`
- `network.allowlistDomains` must include `stripe.com` for real requests
  (not permitted under current policy).

## CLI Examples
Preview:
```
node dist/cli/index.js payment:preview --input '{"priceId":"price_basic","currency":"usd","customerEmail":"user@allow.com"}'
```

Request (blocked in Phase 3):
```
node dist/cli/index.js payment:request --approve --input '{"priceId":"price_basic","currency":"usd","customerEmail":"user@allow.com","dryRun":false}'
```

## Notes
- Real outbound requests are disabled under current policy.

## Live Outbound (Not Permitted)
Live Stripe requests are disabled under the current policy set.
