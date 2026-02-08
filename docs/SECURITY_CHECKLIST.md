# Security Checklist (Phase 15)

## Secrets hygiene
- [ ] `.env` and `*.local` files are gitignored.
- [ ] `.env.example` contains only safe variable names.
- [ ] No API keys/tokens in repo history (scan).

## Permission boundaries
- [ ] Network is OFF by default.
- [ ] Live network requires allowlist + window + JARVIS_NETWORK_LIVE=1.
- [ ] Kill switch blocks outbound categories.
- [ ] Allowlists/denylists enforced (paths + domains/URLs if corridor exists).
- [ ] Approval required for risky actions (write, outbound, external).

## Audit redaction
- [ ] Redact sensitive keys (token, authorization, cookie, password, apiKey).
- [ ] Redact headers (Authorization, Set-Cookie, Cookie).

## Supply-chain sanity
- [ ] Lockfile present (package-lock.json).
- [ ] No surprise scripts/postinstall behavior.
- [ ] CI uses `npm ci` for reproducible builds.

## UI safety
- [ ] Server never returns env vars to UI.

## Done check
- `git grep -nE "sk-|api[_-]?key|bearer|authorization|cookie|password" .`
- `npm ci`
- `npm run build`
- `npm test`
