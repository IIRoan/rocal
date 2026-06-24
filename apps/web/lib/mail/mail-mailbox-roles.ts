import type { JmapMailbox } from "./types";

const JUNK_ROLES = new Set(["junk", "spam"]);
const TRASH_ROLES = new Set(["trash"]);

export function normalizeMailboxRole(
  role: string | null | undefined,
): string {
  return role?.toLowerCase() ?? "";
}

export function isJunkMailboxRole(role: string | null | undefined): boolean {
  return JUNK_ROLES.has(normalizeMailboxRole(role));
}

export function isTrashMailboxRole(role: string | null | undefined): boolean {
  return TRASH_ROLES.has(normalizeMailboxRole(role));
}

export function canEmptyMailboxRole(role: string | null | undefined): boolean {
  const normalized = normalizeMailboxRole(role);
  return JUNK_ROLES.has(normalized) || TRASH_ROLES.has(normalized);
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

export function findJunkMailbox(
  mailboxes: JmapMailbox[],
): JmapMailbox | undefined {
  return findMailboxByRole(mailboxes, ["junk", "spam"]);
}

export function findTrashMailbox(
  mailboxes: JmapMailbox[],
): JmapMailbox | undefined {
  return findMailboxByRole(mailboxes, ["trash"]);
}
