# Phase 4 Go Live Checklist (Stripe + Twilio)

This checklist is for enabling **live** outbound execution under strict
governance. Network remains OFF by default.

## Enable Order
1) Confirm `strictApprovalMode=true`
2) Set `network.enabled=true`
3) Configure allowlists:
   - `network.allowlistDomains` includes `api.stripe.com` and `api.twilio.com`
   - Stripe allowlists (`stripePriceAllowlist`, `stripeAmountAllowlist`, etc.)
   - Call allowlists (`calls.fromNumberAllowlist`, `calls.toNumberAllowlist`, `calls.countryAllowlist`)
   - `permissions.callTemplateAllowlist` contains `calls.twimlUrl`
4) Enable modules:
   - `stripe.enabled=true`
   - `calls.enabled=true`
5) Set secrets in `.env`:
   - `STRIPE_SECRET_KEY`
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

## Verification Steps
- Run `payment:preview` and `call:preview` with allowlisted inputs.
- Run `payment:request --approve` and `call:make --approve` only after verifying audit logs.
- Confirm audit log redacts auth tokens and does not store bodies.

## Rollback Steps
1) Flip kill switch to ON
2) Set `network.enabled=false`
3) Set `stripe.enabled=false` and `calls.enabled=false`

## Audit + Receipts
- Verify `logs/audit.log` contains request/response events.
- Verify receipt files under `data/receipts/` are redacted.
