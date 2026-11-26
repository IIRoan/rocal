export type MailMessageFlags = {
  id: string;
  keywords?: Record<string, boolean> | null;
  mailboxIds?: Record<string, boolean> | null;
};

/** Ids in the refreshed window that no held message covers, so only those are downloaded. */
export function missingMailboxMessageIds(
  flags: readonly MailMessageFlags[],
  held: ReadonlyMap<string, unknown>,
): string[] {
  return flags.filter((entry) => !held.has(entry.id)).map((entry) => entry.id);
}

/** The refreshed window in server order: held messages take the fresh read, flag and folder state, new ones come from `fetched`. */
export function mergeMailboxRefresh<T extends MailMessageFlags>(
  flags: readonly MailMessageFlags[],
  held: ReadonlyMap<string, T>,
  fetched: readonly T[],
): T[] {
  const fetchedById = new Map(fetched.map((message) => [message.id, message]));
  return flags.flatMap((entry) => {
    const kept = held.get(entry.id);
    if (kept) {
      return [{ ...kept, keywords: entry.keywords ?? kept.keywords, mailboxIds: entry.mailboxIds ?? kept.mailboxIds }];
    }
    const added = fetchedById.get(entry.id);
    return added ? [added] : [];
  });
}
