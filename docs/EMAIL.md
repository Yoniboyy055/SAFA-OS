# Email (Governed)

Email is an outbound module with strict governance: approvals, allowlists,
kill switch, and append-only audit logs. Network remains OFF by default.

## Safety Principles
- Dry-run previews are always available.
- Real sends require approval + allowlists + network enabled.
- No secrets or full bodies are logged.

## Required Allowlists
- `email.fromAllowlist`
- `email.toAllowlist` or `email.domainAllowlist`
- `permissions.emailSubjectAllowlist`
- `permissions.emailTemplateAllowlist` (if using `templateId`)
- `network.allowlistDomains` must include SMTP host (e.g., `smtp.gmail.com`) for real sends.

## CLI Examples
Preview:
```
node dist/cli/index.js email:preview --input '{"to":"ALLOWLISTED@domain.com","subject":"Hello","body":"Draft body"}'
```

Send (real, approval required):
```
node dist/cli/index.js email:send --approve --input '{"to":"ALLOWLISTED@domain.com","subject":"Hello","body":"Live body","dryRun":false}'
```

## Notes
- Body content is hashed in audit logs; raw bodies are never logged.
- Use `.env` for SMTP credentials; never commit secrets.
