import type { JmapEmailMessage, JmapMailbox, MailAddress } from "./types";
import {
  isValidEmailAddress,
  parseAddressList,
  resolveReplyAllRecipients,
  validateComposeRecipients,
} from "@workspace/calendar-core";

const MAILBOX_ROLE_ORDER: Record<string, number> = {
  inbox: 0,
  sent: 1,
  drafts: 2,
  archive: 3,
  junk: 4,
  spam: 4,
  trash: 5,
};

export function formatThreadSenders(messages: JmapEmailMessage[]): string {
  const uniqueSenders = Array.from(
    new Set(messages.map((message) => formatAddress(message.from))),
  );

  if (uniqueSenders.length <= 2) {
    return uniqueSenders.join(", ");
  }

  return `${uniqueSenders.slice(0, 2).join(", ")} +${uniqueSenders.length - 2}`;
}

export function formatAddress(addresses: MailAddress[] | undefined): string {
  const first = addresses?.[0];
  if (!first) return "Unknown";
  return first.name?.trim() || first.email;
}

export function formatAddressFull(
  addresses: MailAddress[] | undefined,
  maxCount = 3,
): string {
  if (!addresses?.length) return "Unknown";
  const formatted = addresses.slice(0, maxCount).map((a) => {
    const name = a.name?.trim();
    return name ? `${name} <${a.email}>` : a.email;
  });
  const rest = addresses.length - maxCount;
  if (rest > 0) formatted.push(`+${rest} more`);
  return formatted.join(", ");
}

export function formatMessageDate(receivedAt: string | undefined): string {
  if (!receivedAt) return "";
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function isMessageRead(message: JmapEmailMessage): boolean {
  return message.keywords?.["$seen"] === true;
}

export function isMessageFlagged(message: JmapEmailMessage): boolean {
  return message.keywords?.["$flagged"] === true;
}

export function isDraftMessage(
  message: JmapEmailMessage,
  selectedMailboxId: string | null,
  mailboxes: JmapMailbox[],
): boolean {
  if (message.keywords?.["$draft"] === true) {
    return true;
  }

  const draftsMailboxId = getPrimaryMailboxId(mailboxes, "drafts");
  if (!draftsMailboxId) {
    return false;
  }

  if (selectedMailboxId === draftsMailboxId) {
    return true;
  }

  return Boolean(message.mailboxIds?.[draftsMailboxId]);
}

export function sortMessagesByDate(
  messages: JmapEmailMessage[],
): JmapEmailMessage[] {
  return [...messages].sort((a, b) => {
    const aTime = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const bTime = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function getPrimaryMailboxId(
  mailboxes: JmapMailbox[],
  role: string,
): string | null {
  return mailboxes.find((mailbox) => mailbox.role === role)?.id ?? null;
}

/** Sorts mailboxes by JMAP sortOrder when set, then well-known roles, then name. */
export function sortMailboxes(mailboxes: JmapMailbox[]): JmapMailbox[] {
  const hasSortOrder = mailboxes.some((mailbox) => mailbox.sortOrder != null);
  return [...mailboxes].sort((a, b) => {
    if (hasSortOrder) {
      const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
    const aRole = a.role ? (MAILBOX_ROLE_ORDER[a.role] ?? 50) : 60;
    const bRole = b.role ? (MAILBOX_ROLE_ORDER[b.role] ?? 50) : 60;
    if (aRole !== bRole) return aRole - bRole;
    return a.name.localeCompare(b.name);
  });
}

export function isSpamMailboxRole(role: string | null | undefined): boolean {
  const normalized = role?.toLowerCase() ?? "";
  return normalized === "junk" || normalized === "spam";
}

export function getMailboxDisplayName(mailbox: JmapMailbox): string {
  if (isSpamMailboxRole(mailbox.role)) {
    return "Spam";
  }
  return mailbox.name;
}

export function getMailboxIcon(mailbox: JmapMailbox): string {
  switch (mailbox.role) {
    case "inbox":
      return "inbox";
    case "sent":
      return "send";
    case "drafts":
      return "edit-3";
    case "archive":
      return "archive";
    case "junk":
    case "spam":
      return "alert-octagon";
    case "trash":
      return "trash-2";
    default:
      return "folder";
  }
}

export function getInitials(address: MailAddress[] | undefined): string {
  const first = address?.[0];
  const source = first?.name?.trim() || first?.email || "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
}

export { isValidEmailAddress };

/** @deprecated Use isValidEmailAddress */
export const isLikelyEmail = isValidEmailAddress;

/** Returns bare email addresses parsed from a recipient field. */
export function parseEmailList(value: string): string[] {
  return parseAddressList(value).map((address) => address.email);
}

export type ComposeValidationResult = {
  to: string[];
  cc: string[];
  bcc: string[];
  errors: {
    to?: string;
    subject?: string;
    recipients?: string;
  };
};

/** Validates and normalises native compose form input. */
export function validateComposeInput(input: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
}): ComposeValidationResult {
  const validation = validateComposeRecipients({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
  });

  return {
    to: validation.to.map((address) => address.email),
    cc: validation.cc.map((address) => address.email),
    bcc: validation.bcc.map((address) => address.email),
    errors: validation.errors,
  };
}

/** Formats Reply All To/Cc fields from a source message. */
export function formatReplyAllRecipientFields(
  message: Pick<JmapEmailMessage, "from" | "to" | "cc">,
  currentUserEmail?: string | null,
): { to: string; cc: string } {
  const recipients = resolveReplyAllRecipients({
    from: message.from,
    to: message.to,
    cc: message.cc,
    currentUserEmail,
  });
  return {
    to: recipients.to.join(", "),
    cc: recipients.cc.join(", "),
  };
}
