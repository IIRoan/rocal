export type MailRecipientRef = {
  email: string;
  name?: string | null;
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
  if (!accountLocal || !accountDomain || recipientDomain !== accountDomain) {
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
