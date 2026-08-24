export function parseHiddenMailboxIds(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  } catch {
    return [];
  }
}

export function serializeHiddenMailboxIds(ids: Iterable<string>): string {
  return JSON.stringify([...new Set(ids)]);
}

export function toggleHiddenMailboxId(
  hiddenIds: string[],
  mailboxId: string,
): string[] {
  const next = new Set(hiddenIds);
  if (next.has(mailboxId)) {
    next.delete(mailboxId);
  } else {
    next.add(mailboxId);
  }
  return [...next];
}
