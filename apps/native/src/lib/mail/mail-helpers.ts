import type { JmapEmailMessage, JmapMailbox, MailAddress } from "./types";

const MAILBOX_ROLE_ORDER: Record<string, number> = {
  inbox: 0,
  sent: 1,
  drafts: 2,
  archive: 3,
  junk: 4,
  spam: 4,
  trash: 5,
};

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

/** Sorts mailboxes with well-known roles first, then alphabetically. */
export function sortMailboxes(mailboxes: JmapMailbox[]): JmapMailbox[] {
  return [...mailboxes].sort((a, b) => {
    const aRole = a.role ? (MAILBOX_ROLE_ORDER[a.role] ?? 50) : 60;
    const bRole = b.role ? (MAILBOX_ROLE_ORDER[b.role] ?? 50) : 60;
    if (aRole !== bRole) return aRole - bRole;
    return a.name.localeCompare(b.name);
  });
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
