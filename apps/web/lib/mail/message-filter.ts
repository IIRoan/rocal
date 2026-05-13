export interface FilterableMessage {
  id: string;
  subject?: string | null;
  from?: Array<{ name?: string | null; email?: string | null }> | null;
}

export function filterMessages<T extends FilterableMessage>(
  messages: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return messages;
  return messages.filter((msg) => {
    if (msg.subject?.toLowerCase().includes(q)) return true;
    return (msg.from ?? []).some(
      (f) =>
        f.name?.toLowerCase().includes(q) || f.email?.toLowerCase().includes(q),
    );
  });
}
