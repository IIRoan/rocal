import type { JmapMailbox } from "./types";

const PROTECTED_MAILBOX_ROLES = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "junk",
  "spam",
]);

export function normalizeMailboxRole(
  role: string | null | undefined,
): string | null {
  const normalized = role?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function isProtectedMailboxRole(
  role: string | null | undefined,
): boolean {
  const normalized = normalizeMailboxRole(role);
  return normalized ? PROTECTED_MAILBOX_ROLES.has(normalized) : false;
}

export function canRenameOrDeleteMailbox(
  mailbox: Pick<JmapMailbox, "role">,
): boolean {
  return !isProtectedMailboxRole(mailbox.role);
}

export function canHideMailbox(mailbox: Pick<JmapMailbox, "role">): boolean {
  return normalizeMailboxRole(mailbox.role) !== "inbox";
}

export function filterVisibleMailboxes<T extends { id: string }>(
  mailboxes: T[],
  hiddenIds: Iterable<string>,
): T[] {
  const hidden = new Set(hiddenIds);
  return mailboxes.filter((mailbox) => !hidden.has(mailbox.id));
}

export function moveMailboxIndex<T>(
  mailboxes: T[],
  index: number,
  direction: "up" | "down",
): T[] {
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= mailboxes.length) {
    return mailboxes;
  }
  const next = [...mailboxes];
  const current = next[index];
  const swap = next[nextIndex];
  if (!current || !swap) {
    return mailboxes;
  }
  next[index] = swap;
  next[nextIndex] = current;
  return next;
}

export function mailboxSortUpdates(
  mailboxes: Array<Pick<JmapMailbox, "id">>,
): { id: string; sortOrder: number }[] {
  return mailboxes.map((mailbox, index) => ({
    id: mailbox.id,
    sortOrder: index,
  }));
}
