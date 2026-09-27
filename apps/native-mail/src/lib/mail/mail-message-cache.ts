import type { JmapEmailMessage } from "./types";

export type MailboxMessagesPage = {
  messages: JmapEmailMessage[];
  total: number;
  position: number;
};

export type MailboxMessagesInfiniteData = {
  pages: MailboxMessagesPage[];
  pageParams: number[];
};

export type MailboxMessagesCacheData =
  | MailboxMessagesInfiniteData
  | {
      messages: JmapEmailMessage[];
      total: number;
    };

export function flattenMailboxMessagesCache(
  data: MailboxMessagesCacheData | undefined,
): JmapEmailMessage[] {
  if (!data) return [];
  if ("pages" in data) {
    return data.pages.flatMap((page) => page.messages);
  }
  return data.messages;
}

export function patchMailboxMessagesCache(
  data: MailboxMessagesCacheData,
  messageIds: Set<string>,
  patch: (message: JmapEmailMessage) => Partial<JmapEmailMessage>,
): MailboxMessagesCacheData | null {
  if ("pages" in data) {
    let changed = false;
    const pages = data.pages.map((page) => {
      let pageChanged = false;
      const messages = page.messages.map((message) => {
        if (!messageIds.has(message.id)) return message;
        pageChanged = true;
        changed = true;
        return { ...message, ...patch(message) };
      });
      return pageChanged ? { ...page, messages } : page;
    });
    return changed ? { ...data, pages } : null;
  }

  let changed = false;
  const messages = data.messages.map((message) => {
    if (!messageIds.has(message.id)) return message;
    changed = true;
    return { ...message, ...patch(message) };
  });
  return changed ? { ...data, messages } : null;
}

export function removeMessagesFromMailboxCache(
  data: MailboxMessagesCacheData,
  messageIds: Set<string>,
): MailboxMessagesCacheData | null {
  if ("pages" in data) {
    let changed = false;
    const pages = data.pages.map((page) => {
      const messages = page.messages.filter((message) => {
        if (!messageIds.has(message.id)) return true;
        changed = true;
        return false;
      });
      return messages.length === page.messages.length
        ? page
        : { ...page, messages, total: Math.max(0, page.total - (page.messages.length - messages.length)) };
    });
    return changed ? { ...data, pages } : null;
  }

  const messages = data.messages.filter((message) => !messageIds.has(message.id));
  if (messages.length === data.messages.length) return null;
  return {
    ...data,
    messages,
    total: Math.max(0, data.total - (data.messages.length - messages.length)),
  };
}

function receivedAtMs(message: JmapEmailMessage): number {
  const parsed = message.receivedAt ? Date.parse(message.receivedAt) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function insertByReceivedAt(
  list: JmapEmailMessage[],
  message: JmapEmailMessage,
): JmapEmailMessage[] {
  const at = receivedAtMs(message);
  const index = list.findIndex((entry) => receivedAtMs(entry) < at);
  const next = [...list];
  next.splice(index < 0 ? next.length : index, 0, message);
  return next;
}

/** Re-inserts messages newest-first (undo of a move); messages already present are skipped. */
export function insertMessagesIntoMailboxCache(
  data: MailboxMessagesCacheData,
  messages: JmapEmailMessage[],
): MailboxMessagesCacheData | null {
  const present = new Set(flattenMailboxMessagesCache(data).map((m) => m.id));
  const missing = messages.filter((message) => !present.has(message.id));
  if (missing.length === 0) return null;

  if (!("pages" in data)) {
    let list = data.messages;
    for (const message of missing) list = insertByReceivedAt(list, message);
    return { ...data, messages: list, total: data.total + missing.length };
  }

  if (data.pages.length === 0) return null;
  const pages = data.pages.map((page) => ({ ...page }));
  for (const message of missing) {
    const at = receivedAtMs(message);
    const lastIndex = pages.length - 1;
    const pageIndex = pages.findIndex(
      (page, index) =>
        index === lastIndex || page.messages.some((entry) => receivedAtMs(entry) < at),
    );
    const page = pages[pageIndex];
    if (!page) continue;
    pages[pageIndex] = { ...page, messages: insertByReceivedAt(page.messages, message) };
  }
  return {
    ...data,
    pages: pages.map((page) => ({ ...page, total: page.total + missing.length })),
  };
}

export function patchSingleMailboxMessageCache(
  data: MailboxMessagesCacheData,
  messageId: string,
  patch: (message: JmapEmailMessage) => Partial<JmapEmailMessage>,
): MailboxMessagesCacheData | null {
  return patchMailboxMessagesCache(data, new Set([messageId]), patch);
}
