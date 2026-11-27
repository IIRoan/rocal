import { DEFAULT_SUB_ADDRESS_DELIMITER, parseSubAddress } from "./mail-sub-addressing";

export type MailRecipientRef = {
  email: string;
  name?: string | null;
};

/** A recipient, marked when the address is one of the signed-in user's own. */
export type SummarizedMailRecipient = MailRecipientRef & { self: boolean };

type MailRecipientGroup = {
  kind: "to" | "cc" | "bcc";
  recipients: SummarizedMailRecipient[];
};

export type MailRecipientSummary = {
  /** To, Cc and Bcc in that order, without empty groups. */
  groups: MailRecipientGroup[];
  /** Everyone once, the signed-in user first. */
  people: SummarizedMailRecipient[];
  /** The plus-tag of the user's own address the message was sent to. */
  selfTag: string | null;
};

/** Whether an address belongs to the signed-in account (including sub-addresses). */
export function isCurrentUserMailAddress(
  address: string,
  accountEmail?: string | null,
): boolean {
  if (!accountEmail) return false;

  const normalized = address.trim().toLowerCase();
  const account = accountEmail.trim().toLowerCase();
  if (!normalized || !account) return false;
  if (normalized === account) return true;

  const [accountLocal, accountDomain] = account.split("@");
  const [recipientLocal, recipientDomain] = normalized.split("@");
  if (
    !accountLocal ||
    !accountDomain ||
    !recipientLocal ||
    recipientDomain !== accountDomain
  ) {
    return false;
  }

  const accountBase = accountLocal.split("+")[0] ?? accountLocal;
  return (
    recipientLocal === accountBase ||
    recipientLocal.startsWith(`${accountBase}+`)
  );
}

/** Fill in the current user's display name when the recipient is their own address. */
export function enrichSelfMailRecipient(
  recipient: MailRecipientRef,
  account?: {
    email?: string | null;
    name?: string | null;
  },
): MailRecipientRef {
  if (!isCurrentUserMailAddress(recipient.email, account?.email)) {
    return recipient;
  }

  const name = recipient.name?.trim() || account?.name?.trim();
  return name ? { ...recipient, name } : recipient;
}

function addressBase(email: string, delimiter: string): string {
  const parsed = parseSubAddress(email.trim().toLowerCase(), delimiter);
  return `${parsed.baseUser}@${parsed.domain}`;
}

/** Who a message went to, with the signed-in user first and the plus-tag it reached them at. */
export function summarizeMailRecipients(
  message: {
    to?: MailRecipientRef[] | null;
    cc?: MailRecipientRef[] | null;
    bcc?: MailRecipientRef[] | null;
  },
  account: { email?: string | null; name?: string | null; identityEmails?: string[] },
  delimiter: string = DEFAULT_SUB_ADDRESS_DELIMITER,
): MailRecipientSummary {
  const ownBases = new Set(
    [account.email, ...(account.identityEmails ?? [])]
      .filter((email): email is string => Boolean(email?.trim()))
      .map((email) => addressBase(email, delimiter)),
  );
  const summarize = (recipient: MailRecipientRef): SummarizedMailRecipient => {
    const self = ownBases.has(addressBase(recipient.email, delimiter));
    const name = recipient.name?.trim() || (self ? account.name?.trim() : undefined);
    return { email: recipient.email, name: name || null, self };
  };

  const groups = (["to", "cc", "bcc"] as const)
    .map((kind) => ({ kind, recipients: (message[kind] ?? []).filter((r) => r.email?.trim()).map(summarize) }))
    .filter((group) => group.recipients.length > 0);

  const seen = new Set<string>();
  const unique = groups
    .flatMap((group) => group.recipients)
    .filter((recipient) => {
      const key = recipient.email.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const self = unique.find((recipient) => recipient.self);

  return {
    groups,
    people: self ? [self, ...unique.filter((recipient) => recipient !== self)] : unique,
    selfTag: self ? parseSubAddress(self.email.trim().toLowerCase(), delimiter).tag : null,
  };
}
