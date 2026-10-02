import {
  resolveReplyAllRecipients,
  resolveReplyRecipients,
  type ReplyAllRecipients,
} from "./mail-addresses";
import {
  getDeliveredToAddresses,
  getSimpleLoginForward,
  getSimpleLoginReplyNotice,
  type MailSimpleLoginFields,
} from "./mail-simplelogin";

type ReplyIdentity = {
  id: string;
  email: string;
};

type ReplyRecipient = {
  email?: string | null;
  name?: string | null;
};

type ReplyRecipients = {
  /** Topmost first; the mailbox Stalwart actually delivered to. */
  deliveredTo?: ReplyRecipient[];
  to?: ReplyRecipient[];
  cc?: ReplyRecipient[];
  bcc?: ReplyRecipient[];
};

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeBaseEmailAddress(email: string): string {
  const normalized = normalizeEmailAddress(email);
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0) {
    return normalized;
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const plusIndex = localPart.indexOf("+");

  return `${plusIndex >= 0 ? localPart.slice(0, plusIndex) : localPart}@${domain}`;
}

function domainOf(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(at + 1).toLowerCase() : "";
}

export type ReplyFromResolution = {
  identityId: string;
  overrideEmail?: string;
  overrideName?: string;
};

/** Pick the identity (+ optional header-From override) for replying to a message. */
export function resolveReplyFrom(
  identities: readonly ReplyIdentity[],
  recipients?: ReplyRecipients,
): ReplyFromResolution | null {
  if (identities.length === 0 || !recipients) {
    return null;
  }

  // SimpleLogin only accepts replies from the mailbox it forwarded to, which To (the alias) never names.
  for (const delivered of recipients.deliveredTo ?? []) {
    const email = delivered.email?.trim();
    if (!email) continue;
    const identity =
      identities.find(
        (entry) => normalizeEmailAddress(entry.email) === normalizeEmailAddress(email),
      ) ??
      identities.find(
        (entry) =>
          normalizeBaseEmailAddress(entry.email) === normalizeBaseEmailAddress(email),
      );
    if (identity) {
      return { identityId: identity.id };
    }
  }

  const received: { email: string; name: string | undefined }[] = [
    ...(recipients.to || []),
    ...(recipients.cc || []),
    ...(recipients.bcc || []),
  ].flatMap((recipient) => {
    const email = recipient.email?.trim();
    if (!email) return [];
    return [{ email, name: recipient.name?.trim() || undefined }];
  });

  if (received.length === 0) {
    return null;
  }

  const identityEmails = new Set(
    identities.map((identity) => normalizeEmailAddress(identity.email)),
  );
  const identityBaseEmails = new Set(
    identities.map((identity) => normalizeBaseEmailAddress(identity.email)),
  );

  const exactIdentity = identities.find((identity) =>
    received.some(
      (recipient) =>
        normalizeEmailAddress(recipient.email) ===
        normalizeEmailAddress(identity.email),
    ),
  );
  if (exactIdentity) {
    return { identityId: exactIdentity.id };
  }

  const baseIdentity = identities.find((identity) =>
    received.some(
      (recipient) =>
        normalizeBaseEmailAddress(recipient.email) ===
        normalizeBaseEmailAddress(identity.email),
    ),
  );
  if (baseIdentity) {
    return { identityId: baseIdentity.id };
  }

  const ownedDomains = new Set(
    identities.map((identity) => domainOf(identity.email)).filter(Boolean),
  );

  const catchAll = received.find((recipient) => {
    const email = normalizeEmailAddress(recipient.email);
    if (
      identityEmails.has(email) ||
      identityBaseEmails.has(normalizeBaseEmailAddress(email))
    ) {
      return false;
    }
    return ownedDomains.has(domainOf(email));
  });

  if (catchAll) {
    const anchor =
      identities.find(
        (identity) => domainOf(identity.email) === domainOf(catchAll.email),
      ) ?? identities[0];
    if (!anchor) return null;
    return {
      identityId: anchor.id,
      overrideEmail: catchAll.email,
      overrideName: catchAll.name,
    };
  }

  return null;
}

type ReplySourceMessage = MailSimpleLoginFields & {
  from?: ReplyRecipient[] | null;
  to?: ReplyRecipient[] | null;
  cc?: ReplyRecipient[] | null;
  bcc?: ReplyRecipient[] | null;
};

/** Reply identity for a message: topmost Delivered-To identity, then To/Cc/Bcc matches. */
export function resolveMessageReplyFrom(
  identities: readonly ReplyIdentity[],
  message: ReplySourceMessage,
): ReplyFromResolution | null {
  return resolveReplyFrom(identities, {
    deliveredTo: getDeliveredToAddresses(message),
    to: message.to ?? undefined,
    cc: message.cc ?? undefined,
    bcc: message.bcc ?? undefined,
  });
}

/** Compose hints for replies to a verified SimpleLogin forward; empty otherwise. */
export function getSimpleLoginReplyHints(input: {
  message: ReplySourceMessage;
  identities: readonly ReplyIdentity[];
  fromEmail: string | null | undefined;
  recipients: readonly string[];
}): string[] {
  const receivingId = resolveMessageReplyFrom(input.identities, input.message)?.identityId;
  const notice = getSimpleLoginReplyNotice({
    message: input.message,
    recipients: input.recipients,
    fromEmail: input.fromEmail,
    receivingEmail: input.identities.find((identity) => identity.id === receivingId)?.email,
  });
  const hints: string[] = [];
  if (notice.replyingThrough) {
    hints.push(
      `Replying through SimpleLogin. ${notice.replyingThrough.sender} sees ${notice.replyingThrough.alias}, not your address.`,
    );
  }
  if (notice.requiredFrom) {
    hints.push(`SimpleLogin only accepts replies from ${notice.requiredFrom}.`);
  }
  return hints;
}

/** Reply or reply-all recipients, never including the user's identities or the SimpleLogin alias. */
export function resolveMessageReplyRecipients(
  message: ReplySourceMessage,
  input: {
    mode: "reply" | "reply-all";
    fromEmail?: string | null;
    identities?: readonly { email: string }[];
  },
): ReplyAllRecipients {
  const alias = getSimpleLoginForward(message)?.alias;
  const recipientsInput = {
    from: message.from,
    replyTo: message.replyTo,
    to: message.to,
    cc: message.cc,
    currentUserEmail: input.fromEmail,
    identityEmails: (input.identities ?? []).map((identity) => identity.email),
    excludeEmails: alias ? [alias] : [],
  };
  return input.mode === "reply-all"
    ? resolveReplyAllRecipients(recipientsInput)
    : { to: resolveReplyRecipients(recipientsInput), cc: [] };
}
