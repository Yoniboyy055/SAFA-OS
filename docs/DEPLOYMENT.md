# Jarvis OS Deployment Guide

This guide provides step-by-step instructions for deploying Jarvis OS in production or development environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Token Generation](#token-generation)
4. [API Keys Configuration](#api-keys-configuration)
5. [Email Configuration](#email-configuration)
6. [Payment Configuration (Stripe)](#payment-configuration-stripe)
7. [Phone/SMS Configuration (Twilio)](#phonesms-configuration-twilio)
8. [Build and Test](#build-and-test)
9. [Security Best Practices](#security-best-practices)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js**: v20.11.1 or higher
- **npm**: v9.0.0 or higher
- **Git**: For version control
- **Operating System**: Linux, macOS, or Windows (WSL recommended)

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Yoniboyy055/jarvis-os.git
cd jarvis-os
```

### 2. Install Dependencies

```bash
npm ci
```

### 3. Create Environment File

```bash
cp .env.example .env
```

**Important**: Never commit your `.env` file to version control. It's already included in `.gitignore`.

## Token Generation

Generate cryptographically secure tokens for authentication:

```bash
node scripts/generate-tokens.js
```

This will generate:
- `SAFA_OWNER_TOKEN`: Owner authentication token
- `SESSION_SIGNING_KEY`: Session management key
- `WORKER_HMAC_KEY`: Worker authentication key

Copy the generated tokens to your `.env` file.

### Token Security Guidelines

- **Store securely**: Use a password manager or secure vault
- **Rotate regularly**: Change tokens every 90 days
- **Environment-specific**: Use different tokens for dev/staging/prod
- **Never share**: Don't send tokens via email, chat, or insecure channels
- **Revoke if compromised**: Generate new tokens immediately if exposed

## API Keys Configuration

### OpenAI (Required for LLM Features)

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key and add to `.env`:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Cost Considerations**:
- Default model: `gpt-4o-mini` (~$0.15 per 1M input tokens)
- Set cost guards in `safa.config.json` to limit spending
- Monitor usage in OpenAI dashboard

### Anthropic (Optional - for Claude Models)

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an API key
3. Add to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### GitHub (Optional - for Git Operations)

1. Go to [GitHub Settings > Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `read:org`
4. Copy token and add to `.env`:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Email Configuration

### Option 1: Gmail (Recommended for Development)

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate App Password**:
   - Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" and "Other (Custom name)"
   - Enter "Jarvis OS" as the name
   - Copy the 16-character password

3. **Update .env**:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=abcd efgh ijkl mnop  # App password (remove spaces)
EMAIL_FROM="Your Name <your_gmail@gmail.com>"
```

### Option 2: SendGrid (Recommended for Production)

1. Sign up at [SendGrid](https://sendgrid.com/)
2. Create an API key
3. Update `.env`:

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM="Your Name <verified@yourdomain.com>"
```

**Note**: SendGrid requires domain verification for production use.

### Option 3: Resend (Modern Alternative)

1. Sign up at [Resend](https://resend.com/)
2. Create an API key
3. Update `.env`:

```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM="Your Name <verified@yourdomain.com>"
```

### Email Allowlists

Update `safa.config.json` to configure email allowlists:

```json
{
  "email": {
    "enabled": true,
    "provider": "smtp",
    "fromAllowlist": ["jarvis@yourdomain.com"],
    "toAllowlist": ["*@yourdomain.com", "trusted@example.com"],
    "maxEmailsPerHour": 10,
    "requireApproval": true
  }
}
```

## Payment Configuration (Stripe)

### Development (Test Mode)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to Developers > API Keys
3. Copy the **test** secret key (starts with `sk_test_`)
4. Update `.env`:

```bash
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY_HERE
```

### Production

1. Complete Stripe account activation
2. Switch to "Live mode" in dashboard
3. Copy the **live** secret key (starts with `sk_live_`)
4. Update `.env` and `safa.config.json`:

```bash
STRIPE_SECRET_KEY=sk_live_YOUR_LIVE_KEY_HERE
```

```json
{
  "stripe": {
    "enabled": true,
    "mode": "production",
    "dryRunDefault": false
  }
}
```

**Security Note**: Always test with test keys before enabling production mode.

## Phone/SMS Configuration (Twilio)

1. Sign up at [Twilio](https://www.twilio.com/)
2. Get a phone number
3. Find credentials in Twilio Console
4. Update `.env`:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+1234567890
```

5. Update `safa.config.json`:

```json
{
  "calls": {
    "enabled": true,
    "provider": "twilio",
    "fromNumberAllowlist": ["+1234567890"],
    "toNumberAllowlist": ["+1098765432"],
    "dryRunDefault": false
  }
}
```

## Build and Test

### 1. Build the Project

```bash
npm run build
```

Expected output:
```
✓ TypeScript compilation successful
✓ Post-build steps completed
```

### 2. Run Tests

```bash
npm test
```

All tests should pass. If any fail, check:
- Environment variables are set correctly
- Dependencies are installed (`npm ci`)
- Node.js version is correct (`node --version`)

### 3. Test Token Generation

```bash
node scripts/generate-tokens.js
```

Should generate new secure tokens.

### 4. Test CLI

```bash
node dist/cli/index.js --help
```

### 5. Test LLM Planning (if OpenAI configured)

```bash
node dist/cli/index.js plan "send email to john@example.com about meeting" --llm
```

### 6. Test Email (Dry Run)

```bash
node dist/cli/index.js run send_email --approve --input '{
  "to": "test@yourdomain.com",
  "subject": "Test",
  "body": "Hello from Jarvis",
  "dryRun": true
}'
```

Check `data/outbox/` for the dry-run email file.

### 7. Start Dashboard

```bash
npm run dashboard
```

Navigate to `http://localhost:3000` (or configured port).

## Security Best Practices

### File Permissions

Restrict access to sensitive files:

```bash
chmod 600 .env
chmod 700 data/
chmod 700 logs/
```

### Network Security

- **Firewall**: Enable firewall on production servers
- **HTTPS Only**: Always use HTTPS in production
- **Allowlists**: Keep network allowlists as restrictive as possible
- **Rate Limiting**: Configure rate limits in `safa.config.json`

### Secret Management

- **Never commit secrets**: Check `.gitignore` includes `.env`
- **Scan for secrets**: Run `npm run scan:secrets` regularly
- **Rotate credentials**: Change API keys every 90 days
- **Monitor audit logs**: Review `logs/audit.log` regularly

### Governance Configuration

Enable strict governance in `safa.config.json`:

```json
{
  "governance": {
    "strictApprovalMode": true,
    "networkApprovalMode": "per_request",
    "maxNetworkPayloadBytes": 16384
  }
}
```

### Cost Guards

Prevent runaway costs:

```json
{
  "llm": {
    "costGuardUsd": 0.10,
    "maxTokensPerRequest": 2000
  }
}
```

## Troubleshooting

### Build Errors

**Error**: `Cannot find module 'openai'`
```bash
npm ci
```

**Error**: `TypeScript compilation failed`
- Check Node.js version: `node --version` (should be 20.11.1+)
- Clear cache: `rm -rf node_modules dist && npm ci`

### Runtime Errors

**Error**: `OPENAI_API_KEY is missing`
- Verify `.env` file exists: `ls -la .env`
- Check key is set: `grep OPENAI_API_KEY .env`
- Restart process after changing `.env`

**Error**: `Email sending failed: SMTP authentication error`
- For Gmail: Ensure App Password is used (not regular password)
- Check SMTP credentials in `.env`
- Verify network connectivity to SMTP server

**Error**: `Recipient not allowlisted`
- Update `safa.config.json` email allowlists
- Use wildcard patterns: `*@yourdomain.com`
- Rebuild after config changes: `npm run build`

### Network Issues

**Error**: `Network disabled`
- Set `SAFA_NETWORK_LIVE=1` in `.env` (for production)
- Enable in config: `"network": { "enabled": true }`
- Add domains to allowlist: `"allowlistDomains": ["api.openai.com"]`

**Error**: `SMTP host is not allowlisted`
- Add SMTP host to `safa.config.json`:
```json
{
  "network": {
    "allowlistDomains": ["smtp.gmail.com", "api.openai.com"]
  }
}
```

### Permission Errors

**Error**: `EACCES: permission denied`
```bash
chmod 600 .env
chmod -R 755 dist/
```

### Test Failures

Run specific test:
```bash
node tests/specific_test.test.ts
```

Check test logs:
```bash
cat logs/audit.log | grep ERROR
```

## Getting Help

- **Documentation**: See `docs/` directory
- **Issues**: [GitHub Issues](https://github.com/Yoniboyy055/jarvis-os/issues)
- **Security**: Email security concerns to the maintainers
- **Community**: Check discussions for similar issues

## Next Steps

After successful deployment:

1. ✅ Monitor audit logs: `tail -f logs/audit.log`
2. ✅ Set up automated backups for `data/` directory
3. ✅ Configure monitoring and alerting
4. ✅ Review security checklist: `docs/SECURITY_CHECKLIST.md`
5. ✅ Plan Week 2 features (proactive automation, templates)

## Version Information

- **Current Version**: 0.1.0
- **Target Deployment Readiness**: 85% (after Week 1)
- **Node.js**: 20.11.1+
- **TypeScript**: 5.9.3+

---

**Last Updated**: February 2026  
**Maintained By**: Jarvis OS Team
