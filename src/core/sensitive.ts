export interface RedactionResult {
  redactedText: string;
  findings: string[];
  redacted: boolean;
  hadSecrets: boolean;
  hadPii: boolean;
}

export interface RedactionOptions {
  allowPii?: boolean;
}

const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "api_key", regex: /\bsk-[A-Za-z0-9]{16,}\b/g },
  { label: "stripe_key", regex: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { label: "twilio_sid", regex: /\bAC[0-9a-fA-F]{32}\b/g },
  { label: "twilio_key", regex: /\bSK[0-9a-fA-F]{32}\b/g },
  { label: "bearer_token", regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi },
  { label: "jwt", regex: /\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+/g },
  {
    label: "auth_header",
    regex: /\b(?:authorization|cookie|set-cookie)\s*:\s*[^\n]+/gi
  },
  {
    label: "secret_keyword",
    regex: /\b(?:password|token|secret)\s*[:=]\s*[^\s,;"]+/gi
  }
];

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /\b\+?\d[\d\s().-]{7,}\d\b/g;
const CARD_REGEX = /(?:\d[ -]*?){13,19}/g;

function luhnCheck(value: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const digit = Number(value[i]);
    if (!Number.isFinite(digit)) {
      return false;
    }
    let add = digit;
    if (shouldDouble) {
      add *= 2;
      if (add > 9) {
        add -= 9;
      }
    }
    sum += add;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function replacePattern(
  input: string,
  pattern: RegExp,
  label: string,
  findings: Set<string>
): { output: string; matched: boolean } {
  let matched = false;
  const output = input.replace(pattern, () => {
    matched = true;
    return "[REDACTED]";
  });
  if (matched) {
    findings.add(label);
  }
  return { output, matched };
}

function replaceCardNumbers(
  input: string,
  findings: Set<string>
): { output: string; matched: boolean } {
  let matched = false;
  const output = input.replace(CARD_REGEX, (candidate) => {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) {
      return candidate;
    }
    if (!luhnCheck(digits)) {
      return candidate;
    }
    matched = true;
    findings.add("credit_card");
    return "[REDACTED]";
  });
  return { output, matched };
}

export function redactSensitiveText(
  input: string,
  options: RedactionOptions = {}
): RedactionResult {
  let output = input ?? "";
  const findings = new Set<string>();
  let hadSecrets = false;
  let hadPii = false;

  for (const pattern of SECRET_PATTERNS) {
    const result = replacePattern(output, pattern.regex, pattern.label, findings);
    if (result.matched) {
      hadSecrets = true;
    }
    output = result.output;
  }

  const cardResult = replaceCardNumbers(output, findings);
  if (cardResult.matched) {
    hadSecrets = true;
  }
  output = cardResult.output;

  if (!options.allowPii) {
    const emailResult = replacePattern(output, EMAIL_REGEX, "email", findings);
    if (emailResult.matched) {
      hadPii = true;
    }
    output = emailResult.output;

    const phoneResult = replacePattern(output, PHONE_REGEX, "phone", findings);
    if (phoneResult.matched) {
      hadPii = true;
    }
    output = phoneResult.output;
  } else {
    const emailProbe = new RegExp(EMAIL_REGEX.source, "i");
    const phoneProbe = new RegExp(PHONE_REGEX.source);
    if (emailProbe.test(output)) {
      findings.add("email");
      hadPii = true;
    }
    if (phoneProbe.test(output)) {
      findings.add("phone");
      hadPii = true;
    }
  }

  return {
    redactedText: output,
    findings: Array.from(findings),
    redacted: output !== input,
    hadSecrets,
    hadPii
  };
}
