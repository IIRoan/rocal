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

export function patchSingleMailboxMessageCache(
  data: MailboxMessagesCacheData,
  messageId: string,
  patch: (message: JmapEmailMessage) => Partial<JmapEmailMessage>,
): MailboxMessagesCacheData | null {
  return patchMailboxMessagesCache(data, new Set([messageId]), patch);
}
