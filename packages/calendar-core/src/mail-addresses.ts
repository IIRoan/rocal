export type ParsedMailAddress = {
  email: string;
  name?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercases a bare email address. */
export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Parse a recipient token that may be `Name <email@example.com>` or a bare
 * address. Mirrors the webmail JMAP client behaviour.
 */
export function parseRecipientString(value: string): ParsedMailAddress {
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (angleMatch) {
    const name = angleMatch[1]?.trim();
    const email = normalizeEmailAddress(angleMatch[2] ?? "");
    return name ? { name, email } : { email };
  }

  return { email: normalizeEmailAddress(trimmed) };
}

/** Split a free-text recipient field on commas and semicolons. */
export function parseAddressList(raw: string): ParsedMailAddress[] {
  const seen = new Set<string>();
  const result: ParsedMailAddress[] = [];

  for (const token of raw.split(/[,;]+/)) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    const parsed = parseRecipientString(trimmed);
    if (!parsed.email || seen.has(parsed.email)) continue;

    seen.add(parsed.email);
    result.push(parsed);
  }

  return result;
}

export function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(parseRecipientString(value).email);
}

export type ComposeRecipientValidation = {
  to: ParsedMailAddress[];
  cc: ParsedMailAddress[];
  bcc: ParsedMailAddress[];
  errors: {
    to?: string;
    subject?: string;
    recipients?: string;
  };
};

/** Validate compose recipient fields and return normalized addresses. */
export function validateComposeRecipients(input: {
  to: string;
  cc?: string;
  bcc?: string;
  subject?: string;
}): ComposeRecipientValidation {
  const to = parseAddressList(input.to);
  const cc = parseAddressList(input.cc ?? "");
  const bcc = parseAddressList(input.bcc ?? "");
  const errors: ComposeRecipientValidation["errors"] = {};

  if (to.length === 0) {
    errors.to = "Enter at least one recipient email address.";
  }

  const invalid = [...to, ...cc, ...bcc].filter(
    (address) => !EMAIL_PATTERN.test(address.email),
  );
  if (invalid.length > 0) {
    const label = invalid[0]?.name
      ? `${invalid[0].name} <${invalid[0].email}>`
      : invalid[0]?.email;
    errors.recipients = `Invalid email address: ${label}`;
  }

  if (input.subject !== undefined && !input.subject.trim()) {
    errors.subject = "Enter a subject line.";
  }

  return { to, cc, bcc, errors };
}

export function parsedAddressesToEmails(
  addresses: ParsedMailAddress[],
): string[] {
  return addresses.map((address) => address.email);
}

export function getEmailDomain(value: string): string | null {
  const normalized = normalizeEmailAddress(parseRecipientString(value).email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
}
