export type ParsedMailAddress = {
  email: string;
  name?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

/** Parses `Name <email@example.com>` or a bare address, mirroring the webmail JMAP client. */
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

export const RESERVED_SYSTEM_LOCAL_PARTS = new Set([
  "admin",
  "administrator",
  "root",
  "postmaster",
  "hostmaster",
  "abuse",
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "mailer-daemon",
  "mailerdaemon",
  "alert",
  "alerts",
  "system",
  "security",
]);

const AUTOMATED_LOCAL_PARTS = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "security",
  "hostmaster",
  "abuse",
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "mailer-daemon",
  "mailerdaemon",
  "postmaster",
  "bounce",
  "bounces",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
]);

/** Machine inboxes (noreply, bounce, mailer-daemon, admin) — not people you contact. */
export function isAutomatedMailAddress(value: string): boolean {
  const email = normalizeEmailAddress(parseRecipientString(value).email);
  const local = email.split("@")[0] ?? "";
  const base = (local.split("+")[0] ?? local).replace(/[._]/g, "-");
  if (!base) return false;
  if (AUTOMATED_LOCAL_PARTS.has(base) || AUTOMATED_LOCAL_PARTS.has(local)) {
    return true;
  }
  return base.includes("noreply") || base.includes("no-reply");
}

/** Administrative, system, and machine addresses that must never be invited, provisioned, or used in normal-user queries. */
export function isReservedSystemEmail(
  value: string,
  systemDomain?: string | null,
): boolean {
  if (!value || typeof value !== "string") return false;
  const normalized = normalizeEmailAddress(parseRecipientString(value).email);
  if (!normalized) return false;

  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0) return false;

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const baseLocal = (local.split("+")[0] ?? local).replace(/[._]/g, "-");

  if (
    normalized === "admin@solace.onl" ||
    (baseLocal === "admin" && (domain === "solace.onl" || domain.endsWith(".solace.onl")))
  ) {
    return true;
  }

  const configuredDomain = systemDomain?.trim().toLowerCase();
  const isSystemDomain = !configuredDomain
    ? domain === "solace.onl" || domain.endsWith(".solace.onl")
    : domain === configuredDomain || domain.endsWith(`.${configuredDomain}`);

  if (
    isSystemDomain &&
    (RESERVED_SYSTEM_LOCAL_PARTS.has(baseLocal) || RESERVED_SYSTEM_LOCAL_PARTS.has(local))
  ) {
    return true;
  }

  if (
    baseLocal === "admin" ||
    baseLocal === "postmaster" ||
    baseLocal === "mailer-daemon" ||
    baseLocal === "mailerdaemon" ||
    baseLocal === "noreply" ||
    baseLocal === "no-reply" ||
    baseLocal === "root"
  ) {
    return true;
  }

  return false;
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

/** Send needs valid recipients, a subject, and a message body or attachment. */
export function canSendCompose(input: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
  attachmentCount: number;
}): boolean {
  const { to, errors } = validateComposeRecipients(input);
  const hasContent =
    input.bodyText.trim().length > 0 || input.attachmentCount > 0;
  return (
    to.length > 0 &&
    !errors.to &&
    !errors.recipients &&
    !errors.subject &&
    hasContent
  );
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

/** Configured Solace domain used for outbound encryption decisions. */
export function resolveEncryptionInternalDomain(
  defaultDomain: string | null | undefined,
): string | null {
  const configured = defaultDomain?.trim().toLowerCase();
  return configured || null;
}

/** True only when every recipient is on the configured Solace domain. */
export function shouldEncryptOutgoingMail(
  recipients: string[],
  internalDomain: string | null | undefined,
): boolean {
  const domain = internalDomain?.trim().toLowerCase();
  if (!domain || recipients.length === 0) {
    return false;
  }

  return recipients.every(
    (recipient) => getEmailDomain(recipient) === domain,
  );
}

export function isStalwartEncryptOnAppendEnabled(
  accountSettings: Record<string, unknown> | null | undefined,
): boolean {
  const encryptionAtRest = accountSettings?.encryptionAtRest;
  if (!encryptionAtRest || typeof encryptionAtRest !== "object") {
    return false;
  }

  return (
    (encryptionAtRest as { encryptOnAppend?: boolean }).encryptOnAppend === true
  );
}

type ReplyAddress = {
  email?: string | null;
};

export type ReplyRecipientsInput = {
  from?: ReplyAddress[] | null;
  replyTo?: ReplyAddress[] | null;
  to?: ReplyAddress[] | null;
  cc?: ReplyAddress[] | null;
  currentUserEmail?: string | null;
  /** All addresses the user sends from; never replied to. */
  identityEmails?: readonly string[];
  /** Other addresses never replied to, such as the SimpleLogin alias the message arrived on. */
  excludeEmails?: readonly string[];
};

function createReplyCollector(input: ReplyRecipientsInput) {
  const self = new Set(
    [input.currentUserEmail, ...(input.identityEmails ?? [])]
      .filter((email): email is string => Boolean(email?.trim()))
      .map(normalizeEmailAddress),
  );
  const excluded = new Set([
    ...self,
    ...(input.excludeEmails ?? []).map(normalizeEmailAddress),
  ]);

  const collect = (entries: (ReplyAddress[] | null | undefined)[]): string[] => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const entry of entries.flatMap((group) => group ?? [])) {
      const email = entry.email?.trim();
      if (!email) continue;
      const normalized = normalizeEmailAddress(email);
      if (excluded.has(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      list.push(normalized);
    }
    return list;
  };

  const sentByUser = (input.from ?? []).some(
    (entry) => entry.email?.trim() && self.has(normalizeEmailAddress(entry.email)),
  );

  /** Reply-To wins over From, as in RFC 5322 and Proton; empty for the user's own message. */
  const senderTargets = (): string[] => {
    if (sentByUser) return [];
    const replyTo = collect([input.replyTo]);
    return replyTo.length > 0 ? replyTo : collect([input.from]);
  };

  return { collect, senderTargets };
}

/** Reply to Reply-To, else the sender, minus self; on your own message, fall back to its To + Cc so the conversation continues. */
export function resolveReplyRecipients(input: ReplyRecipientsInput): string[] {
  const { collect, senderTargets } = createReplyCollector(input);
  const targets = senderTargets();
  return targets.length > 0 ? targets : collect([input.to, input.cc]);
}

export type ReplyAllRecipients = {
  to: string[];
  cc: string[];
};

/** Reply all: To is the reply target and Cc is To + Cc minus self, excluded addresses and To; on your own message, To and Cc are kept minus self. */
export function resolveReplyAllRecipients(input: ReplyRecipientsInput): ReplyAllRecipients {
  const { collect, senderTargets } = createReplyCollector(input);
  const targets = senderTargets();
  const to = targets.length > 0 ? targets : collect([input.to]);
  const toSet = new Set(to);
  const cc = collect(targets.length > 0 ? [input.to, input.cc] : [input.cc]).filter(
    (email) => !toSet.has(email),
  );
  return { to, cc };
}
