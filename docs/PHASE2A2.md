# Phase 2A.2 (Design Only) — Network Corridor Blueprint

Status: DESIGN ONLY (no execution, no real HTTP)

## Goals
- Keep network **OFF by default**.
- Permit **allowlist-only**, **approval-gated**, **audited** network requests.
- Maintain a **stub-only** corridor until an explicit owner policy change
  (no live I/O in this phase set).

## Allowlist Model
- **Domains**: exact match or subdomain match.
  - `example.com` allows `example.com` and `api.example.com`.
- **URLs**: exact match only.
  - If `allowlistUrls` is non-empty, the URL must match exactly.
- **Actions**: outbound-intent actions must be explicitly allowlisted by type
  (e.g., email/send, payment/request, call/make) before any live execution.
- **Precedence**:
  1) URL allowlist (if present) must match.
  2) Domain allowlist must match.
  3) Otherwise deny.

## Approval Flows (Design)
- **Per-request approval** (default):
  - Every network request requires explicit approval when strict mode is on.
- **Plan-hash approval**:
  - Approve a plan digest once.
  - Execute only steps that match the approved digest.
- All approvals must be logged in audit with:
  - action, target domain, request hash, approval token or plan hash.

Approval states:
- **PENDING** → **APPROVED** | **DENIED** | **EXPIRED**
- Every transition is auditable.

## Corridor Gate States
- **LOCKED**: kill switch enabled (hard block).
- **DISABLED**: `network.enabled=false` (hard block).
- **ALLOWLIST_FAIL**: domain/URL not allowlisted (deny).
- **APPROVAL_REQUIRED**: approval missing (deny).
- **READY**: all checks pass (still stub-only in Phase 2A).

## Corridor Gates (Design)
- Kill switch blocks all outbound.
- `config.network.enabled` must be true for any live request.
- Allowlist checks must pass.
- Payload size must be within `maxNetworkPayloadBytes`.
- Method allowlist enforced (GET/POST only).
- Redact headers (Authorization/Cookie/Set-Cookie).

## Provider Abstraction (Spec Only)
Network corridor will serve as a single safe gateway for:
- Stripe (payments)
- Twilio (calls)
- Email (SMTP)

Each provider must:
- Use the corridor, never direct HTTP.
- Include an auditable request summary only (no secrets).
- Provide a deterministic preview plan.
- Be blocked entirely when corridor is stub-only.

Provider preview spec (Phase 2B, local-only):
- `stripe.previewPaymentIntent()`
- `email.previewSend()`
- `call.previewDial()`
- `post.previewPublish()`

## Failure Modes
- **Network disabled**: deny with reason.
- **Allowlist miss**: deny with reason.
- **Approval missing**: deny with reason.
- **Payload too large**: deny with reason.
- **Kill switch enabled**: deny with reason.

## Audit + Receipt Lifecycle (Spec)
1) Preview request created → audit `preview.requested`.
2) Approval requested → audit `approval.requested`.
3) Approval decision → audit `approval.approved` or `approval.denied`.
4) Receipt recorded (immutable) → audit `receipt.created`.

## Audit Events (Spec)
For each request:
- `network.request`: urlHash, method, headerKeys, bodyHash, bodyBytes
- `network.response`: status, responseHash, responseBytes, durationMs

No raw request/response bodies are logged.

## Go / No-Go Checklist (Not Applicable)
Live network I/O is **not permitted** under the current policy set.
