#!/usr/bin/env node

/**
 * Token Generation Utility for Jarvis OS
 * 
 * Generates cryptographically secure tokens for:
 * - SAFA_OWNER_TOKEN (owner authentication)
 * - SESSION_SIGNING_KEY (session management)
 * - WORKER_HMAC_KEY (worker authentication)
 * 
 * Usage: node scripts/generate-tokens.js
 */

const crypto = require('crypto');

// Generate a cryptographically secure random token
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Generate a base64-encoded token (for keys that need base64)
function generateBase64Token(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64');
}

console.log('\n========================================');
console.log('🔐 Jarvis OS Token Generator');
console.log('========================================\n');

console.log('Generating cryptographically secure tokens...\n');

const ownerToken = generateToken(32);
const sessionKey = generateToken(32);
const hmacKey = generateToken(32);

console.log('✅ Generated tokens:\n');
console.log('SAFA_OWNER_TOKEN=' + ownerToken);
console.log('SESSION_SIGNING_KEY=' + sessionKey);
console.log('WORKER_HMAC_KEY=' + hmacKey);

console.log('\n========================================');
console.log('📝 Next Steps:');
console.log('========================================\n');

console.log('1. Copy the tokens above to your .env file');
console.log('2. NEVER commit your .env file to version control');
console.log('3. Store tokens securely (use a password manager)');
console.log('4. Regenerate tokens if they are compromised');
console.log('5. Use different tokens for each environment (dev/staging/prod)');

console.log('\n========================================');
console.log('🔒 Security Best Practices:');
console.log('========================================\n');

console.log('• Rotate tokens every 90 days');
console.log('• Use environment-specific tokens (dev, staging, prod)');
console.log('• Never share tokens via email or chat');
console.log('• Keep .env file permissions restrictive (chmod 600)');
console.log('• Monitor audit logs for unauthorized access attempts');
console.log('• Revoke tokens immediately if compromised\n');

console.log('========================================');
console.log('📖 Additional Configuration:');
console.log('========================================\n');

console.log('Get API keys from these sources:');
console.log('• OpenAI: https://platform.openai.com/api-keys');
console.log('• Anthropic: https://console.anthropic.com/');
console.log('• Stripe: https://dashboard.stripe.com/apikeys');
console.log('• Twilio: https://www.twilio.com/console');
console.log('• GitHub: https://github.com/settings/tokens');
console.log('• Gmail App Password: https://myaccount.google.com/apppasswords\n');

console.log('========================================');
console.log('For detailed setup instructions, see:');
console.log('docs/DEPLOYMENT.md');
console.log('========================================\n');
