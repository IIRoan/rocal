import type { JmapMailbox } from "./types";

const SPAM_MAILBOX_ROLES = new Set(["junk", "spam"]);
const TRASH_ROLES = new Set(["trash"]);

export function normalizeMailboxRole(
  role: string | null | undefined,
): string {
  return role?.toLowerCase() ?? "";
}

export function isSpamMailboxRole(role: string | null | undefined): boolean {
  return SPAM_MAILBOX_ROLES.has(normalizeMailboxRole(role));
}

export function isTrashMailboxRole(role: string | null | undefined): boolean {
  return TRASH_ROLES.has(normalizeMailboxRole(role));
}

export function canEmptyMailboxRole(role: string | null | undefined): boolean {
  const normalized = normalizeMailboxRole(role);
  return SPAM_MAILBOX_ROLES.has(normalized) || TRASH_ROLES.has(normalized);
}

export function findMailboxByRole(
  mailboxes: JmapMailbox[],
  roles: string[],
): JmapMailbox | undefined {
  const roleSet = new Set(roles.map((role) => role.toLowerCase()));
  return mailboxes.find((mailbox) =>
    roleSet.has(normalizeMailboxRole(mailbox.role)),
  );
}

export function findInboxMailbox(
  mailboxes: JmapMailbox[],
): JmapMailbox | undefined {
  return findMailboxByRole(mailboxes, ["inbox", "all"]);
}

export function findSpamMailbox(
  mailboxes: JmapMailbox[],
): JmapMailbox | undefined {
  return findMailboxByRole(mailboxes, ["junk", "spam"]);
}

export function findTrashMailbox(
  mailboxes: JmapMailbox[],
): JmapMailbox | undefined {
  return findMailboxByRole(mailboxes, ["trash"]);
}

export function getMailboxDisplayName(mailbox: {
  name: string;
  role?: string | null;
}): string {
  if (isSpamMailboxRole(mailbox.role)) {
    return "Spam";
  }
  return mailbox.name;
}

const SIDEBAR_ROLE_ORDER = [
  "inbox",
  "sent",
  "drafts",
  "archive",
  "junk",
  "spam",
  "trash",
];

/** Sidebar order, which drag and the mailbox settings' move buttons both reorder. */
export function sortMailboxesForSidebar(mailboxes: JmapMailbox[]): JmapMailbox[] {
  return Array.from(mailboxes).sort((a, b) => {
    if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
      return a.sortOrder - b.sortOrder;
    }
    const ai = SIDEBAR_ROLE_ORDER.indexOf(normalizeMailboxRole(a.role));
    const bi = SIDEBAR_ROLE_ORDER.indexOf(normalizeMailboxRole(b.role));
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}
