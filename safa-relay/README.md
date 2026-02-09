# SAFA Relay v1

Vercel UI + API relay for SAFA job requests, approvals, and results. Project name: SAFA OS.

## Environment Variables

Required:
- RESEND_API_KEY
- RESEND_FROM
- SAFA_OWNER_EMAIL=yoniboy055@gmail.com
- SAFA_SESSION_SIGNING_KEY
- SAFA_WORKER_HMAC_KEY
- KV_URL
- KV_REST_API_URL
- KV_REST_API_TOKEN
- KV_REST_API_READ_ONLY_TOKEN

Optional:
- NODE_ENV=production

## API Summary

Auth:
- POST /api/auth/request-otp { email }
- POST /api/auth/verify-otp { email, code }

User endpoints (session cookie required):
- POST /api/jobs
- GET /api/jobs
- GET /api/approvals
- POST /api/approvals/:id
- GET /api/results?jobId=...

Worker endpoints (HMAC required):
- GET /api/worker/queue
- POST /api/worker/claim { jobId }
- POST /api/worker/results { jobId, logs, output }
- POST /api/worker/approvals { jobId, approvalPayload }

### Worker HMAC

Signature payload:
```
{timestamp}.{method}.{path}.{sha256(body)}
```
Headers:
- x-safa-timestamp
- x-safa-signature

## Runbook (End-to-End)

1) Deploy the relay to Vercel.
2) Configure env vars in the Vercel project (SAFA OS).
3) Open https://<your-vercel-domain>/login and log in with OTP.
4) Create a job from /console.
5) Approve the job in the approvals list.
6) Run the laptop poller so it claims and executes jobs.
7) Refresh /console to view results.

## Laptop Worker Notes

Relay job payloads must provide:
- steps: array of SAFA JobStep entries
- scope or allowedTools: array of skill names for delegated token
- ttlMs: optional job TTL

Example payload:
```
{
  "steps": [
    { "id": "step-1", "skill": "list_files", "input": {}, "status": "PENDING" }
  ],
  "scope": ["list_files"]
}
```

