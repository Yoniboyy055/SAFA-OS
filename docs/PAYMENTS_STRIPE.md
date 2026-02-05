# Stripe Payments (Request-Only, Governed)

This module creates **payment requests only**. It does not charge cards or
capture funds directly. All actions are gated by approvals, allowlists, and the
kill switch. Network is OFF by default.

## Safety Principles
- No mass outreach or automated billing.
- Dry-run preview is supported for every request.
- Approval required for real requests.
- All actions are audited with redaction (no secrets logged).

## Required Allowlists
- `permissions.stripePriceAllowlist`
- `permissions.stripeAmountAllowlist`
- `permissions.stripeCurrencyAllowlist`
- `permissions.stripeCustomerEmailAllowlist`
- `network.allowlistDomains` must include `stripe.com` for real requests.

## CLI Examples
Preview:
```
node dist/cli/index.js payment:preview --input '{"priceId":"price_basic","currency":"usd","customerEmail":"user@allow.com"}'
```

Request (real, approval required):
```
node dist/cli/index.js payment:request --approve --input '{"priceId":"price_basic","currency":"usd","customerEmail":"user@allow.com","dryRun":false}'
```

## Notes
- Real outbound requests require: approval + allowlists + network enabled.
- Payment URLs are placeholders until Phase 4 real API enablement.
