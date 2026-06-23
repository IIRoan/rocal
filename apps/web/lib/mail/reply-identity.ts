import type { JmapIdentity } from "./types";

type ReplyRecipient = {
  email?: string | null;
  name?: string | null;
};

type ReplyRecipients = {
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

/**
 * Pick the identity (+ optional header-From override) for replying to a message.
 */
export function resolveReplyFrom(
  identities: JmapIdentity[],
  recipients?: ReplyRecipients,
): ReplyFromResolution | null {
  if (identities.length === 0 || !recipients) {
    return null;
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
      ) || identities[0];
    return {
      identityId: anchor.id,
      overrideEmail: catchAll.email,
      overrideName: catchAll.name,
    };
  }

  return null;
}
