import type { JmapEmailMessage, JmapMailbox } from "./types";

export function getDraftsMailboxId(mailboxes: JmapMailbox[]): string | null {
  return mailboxes.find((mailbox) => mailbox.role === "drafts")?.id ?? null;
}

export function isDraftMessage(
  message: JmapEmailMessage,
  selectedMailboxId: string | null,
  mailboxes: JmapMailbox[],
): boolean {
  if (message.keywords?.["$draft"] === true) {
    return true;
  }

  const draftsMailboxId = getDraftsMailboxId(mailboxes);
  if (!draftsMailboxId) {
    return false;
  }

  if (selectedMailboxId === draftsMailboxId) {
    return true;
  }

  return Boolean(message.mailboxIds?.[draftsMailboxId]);
}
