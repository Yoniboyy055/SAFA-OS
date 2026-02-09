# SAFA Relay v1 Runbook

## Prereqs
- Vercel project name: SAFA OS
- Vercel KV provisioned
- Resend domain verified
- SAFA_WORKER_HMAC_KEY available for laptop worker

## Deploy
1) Deploy the app in the safa-relay directory.
2) Set env vars:
   - RESEND_API_KEY
   - RESEND_FROM
   - SAFA_OWNER_EMAIL=yoniboy055@gmail.com
   - SAFA_SESSION_SIGNING_KEY
   - SAFA_WORKER_HMAC_KEY
   - KV_URL
   - KV_REST_API_URL
   - KV_REST_API_TOKEN
   - KV_REST_API_READ_ONLY_TOKEN

## Phone login
1) Visit /login
2) Request OTP
3) Verify OTP

## Approvals flow
1) Submit job via /console
2) Approve pending approval

## Laptop worker
1) Set relay base URL + SAFA_WORKER_HMAC_KEY in the poller
2) Start the poller
3) Watch jobs run locally
4) Results appear in /console
