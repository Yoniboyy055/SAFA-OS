# Owner Checklist (1-Minute)

When back at laptop:
1) Install deps: `npm install`
   - A lockfile will appear after this step.
   - After a lockfile exists, prefer `npm ci`.
2) Build: `npm run build`
3) Test: `npm test`

Expected output:
- Build completes without errors.
- Tests show PASS for all files.

If failure:
- Paste the **first error block** from the terminal.

Quick sanity checks:
- `rg "fetch|axios|http|https|net|tls" src/`
- Confirm approvals enforced (strict approval mode on).
