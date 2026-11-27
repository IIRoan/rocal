import type { JmapEmailMessage } from "./mail-jmap-types";

type ThreadMessage = Pick<
  JmapEmailMessage,
  "id" | "threadId" | "messageId" | "inReplyTo" | "references" | "receivedAt"
>;

export type MailConversation<T> = {
  id: string;
  messages: T[];
  messageIds: string[];
  latestMessage: T;
};

function normalizeConversationToken(value: string): string {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

function headerFieldValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0,
    );
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [];
}

function getConversationTokens(message: ThreadMessage): string[] {
  const tokens = new Set<string>();

  if (message.threadId) {
    const threadToken = normalizeConversationToken(message.threadId);
    if (threadToken) {
      tokens.add(`thread:${threadToken}`);
    }
  }

  for (const value of [
    ...headerFieldValues(message.messageId),
    ...headerFieldValues(message.inReplyTo),
    ...headerFieldValues(message.references),
  ]) {
    const normalized = normalizeConversationToken(value);
    if (normalized) {
      tokens.add(`header:${normalized}`);
    }
  }

  if (tokens.size === 0) {
    tokens.add(`message:${message.id}`);
  }

  return [...tokens];
}

function getReceivedAtTime(message: ThreadMessage): number {
  return message.receivedAt ? Date.parse(message.receivedAt) : 0;
}

export function buildMailConversations<T extends ThreadMessage>(
  messages: T[],
  options?: { preserveMessageOrder?: boolean },
): MailConversation<T>[] {
  if (messages.length === 0) {
    return [];
  }

  const messageOrder = options?.preserveMessageOrder
    ? new Map(messages.map((message, index) => [message.id, index]))
    : null;

  const parents = new Map<string, string>();
  const tokenOwners = new Map<string, string>();

  const find = (id: string): string => {
    let parent = parents.get(id);
    while (parent !== undefined) {
      const next = parents.get(parent) ?? parent;
      parents.set(id, next);
      id = next;
      parent = parents.get(id);
    }
    return id;
  };

  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parents.set(rightRoot, leftRoot);
    }
  };

  for (const message of messages) {
    for (const token of getConversationTokens(message)) {
      const existingOwner = tokenOwners.get(token);
      if (existingOwner) {
        union(existingOwner, message.id);
      } else {
        tokenOwners.set(token, message.id);
      }
    }
  }

  const grouped = new Map<string, T[]>();
  for (const message of messages) {
    const root = find(message.id);
    const group = grouped.get(root);
    if (group) {
      group.push(message);
    } else {
      grouped.set(root, [message]);
    }
  }

  return [...grouped.values()]
    .map((group) => {
      const orderedMessages = group.sort(
        (left, right) => getReceivedAtTime(left) - getReceivedAtTime(right),
      );
      const latestMessage = orderedMessages.reduce((latest, candidate) =>
        getReceivedAtTime(candidate) >= getReceivedAtTime(latest)
          ? candidate
          : latest,
      );

      const rank = messageOrder
        ? group.reduce(
            (best, message) =>
              Math.min(best, messageOrder.get(message.id) ?? Infinity),
            Infinity,
          )
        : -getReceivedAtTime(latestMessage);

      return {
        rank,
        conversation: {
          id: latestMessage.threadId ?? latestMessage.id,
          messages: orderedMessages,
          messageIds: orderedMessages.map((message) => message.id),
          latestMessage,
        },
      };
    })
    .sort((left, right) => left.rank - right.rank)
    .map(({ conversation }) => conversation);
}

export function filterRelatedThreadMessages<T extends ThreadMessage>(
  mailboxMessages: T[],
  relatedMessages: T[],
): T[] {
  const primaryIds = new Set(mailboxMessages.map((message) => message.id));
  const threadIds = new Set(
    mailboxMessages
      .map((message) => message.threadId)
      .filter((threadId): threadId is string => Boolean(threadId)),
  );

  return relatedMessages.filter((message) => {
    if (primaryIds.has(message.id)) return false;
    return Boolean(message.threadId && threadIds.has(message.threadId));
  });
}

export function buildMailboxThreadRows<T extends ThreadMessage>(
  mailboxMessages: T[],
  relatedMessages: T[] = [],
  options?: { preserveMessageOrder?: boolean },
): MailConversation<T>[] {
  const conversations = buildMailConversations(
    options?.preserveMessageOrder
      ? mailboxMessages
      : [
          ...mailboxMessages,
          ...filterRelatedThreadMessages(mailboxMessages, relatedMessages),
        ],
    options,
  );
  const primaryIdSet = new Set(mailboxMessages.map((message) => message.id));
  const messageOrder = options?.preserveMessageOrder
    ? new Map(mailboxMessages.map((message, index) => [message.id, index]))
    : null;

  const rows: MailConversation<T>[] = [];
  for (const conversation of conversations) {
    const primaryMessages = conversation.messages.filter((message) =>
      primaryIdSet.has(message.id),
    );
    if (primaryMessages.length === 0) continue;

    const latestPrimary = messageOrder
      ? primaryMessages.reduce((best, candidate) =>
          (messageOrder.get(candidate.id) ?? Infinity) <
          (messageOrder.get(best.id) ?? Infinity)
            ? candidate
            : best,
        )
      : primaryMessages.reduce((latest, candidate) =>
          getReceivedAtTime(candidate) >= getReceivedAtTime(latest)
            ? candidate
            : latest,
        );

    rows.push({ ...conversation, latestMessage: latestPrimary });
  }

  return rows;
}

export function getConversationForMessage<T extends ThreadMessage>(
  messages: T[],
  messageId: string | null | undefined,
): T[] {
  if (!messageId) {
    return [];
  }

  const anchor = messages.find((message) => message.id === messageId);
  const threadId = anchor?.threadId;
  const scoped = threadId
    ? messages.filter(
        (message) => message.id === messageId || message.threadId === threadId,
      )
    : messages;

  const conversation = buildMailConversations(scoped).find((entry) =>
    entry.messageIds.includes(messageId),
  );

  return conversation?.messages ?? (anchor ? [anchor] : []);
}
