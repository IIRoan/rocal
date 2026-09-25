import type { JmapEmailMessage } from "./types";

export type MailConversation = {
  id: string;
  messages: JmapEmailMessage[];
  messageIds: string[];
  latestMessage: JmapEmailMessage;
};

function normalizeConversationToken(value: string): string {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

function headerFieldValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [];
}

function getConversationTokens(message: JmapEmailMessage): string[] {
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

function getReceivedAtTime(message: JmapEmailMessage): number {
  return message.receivedAt ? Date.parse(message.receivedAt) : 0;
}

export function buildMailConversations(
  messages: JmapEmailMessage[],
): MailConversation[] {
  if (messages.length === 0) {
    return [];
  }

  const parents = new Map<string, string>();
  const tokenOwners = new Map<string, string>();

  const ensureParent = (id: string) => {
    if (!parents.has(id)) {
      parents.set(id, id);
    }
  };

  const find = (id: string): string => {
    ensureParent(id);
    const parent = parents.get(id)!;
    if (parent === id) {
      return id;
    }
    const root = find(parent);
    parents.set(id, root);
    return root;
  };

  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parents.set(rightRoot, leftRoot);
    }
  };

  for (const message of messages) {
    ensureParent(message.id);
    for (const token of getConversationTokens(message)) {
      const existingOwner = tokenOwners.get(token);
      if (existingOwner) {
        union(existingOwner, message.id);
      } else {
        tokenOwners.set(token, message.id);
      }
    }
  }

  const grouped = new Map<string, JmapEmailMessage[]>();
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
      const orderedMessages = Array.from(group).sort(
        (left, right) => getReceivedAtTime(left) - getReceivedAtTime(right),
      );
      const latestMessage = orderedMessages.reduce((latest, candidate) =>
        getReceivedAtTime(candidate) >= getReceivedAtTime(latest)
          ? candidate
          : latest,
      );

      return {
        id: latestMessage.threadId ?? latestMessage.id,
        messages: orderedMessages,
        messageIds: orderedMessages.map((message) => message.id),
        latestMessage,
      };
    })
    .sort(
      (left, right) =>
        getReceivedAtTime(right.latestMessage) -
        getReceivedAtTime(left.latestMessage),
    );
}

function messageHasBodyPayload(message: JmapEmailMessage): boolean {
  return Boolean(
    message.bodyValues ||
      message.textBody?.length ||
      message.htmlBody?.length ||
      message.attachments?.length,
  );
}

function mergeMailMessage(
  existing: JmapEmailMessage,
  incoming: JmapEmailMessage,
): JmapEmailMessage {
  if (messageHasBodyPayload(incoming)) {
    return { ...existing, ...incoming };
  }
  if (messageHasBodyPayload(existing)) {
    return {
      ...existing,
      ...incoming,
      bodyStructure: existing.bodyStructure,
      bodyValues: existing.bodyValues,
      textBody: existing.textBody,
      htmlBody: existing.htmlBody,
      attachments: existing.attachments,
    };
  }
  return { ...existing, ...incoming };
}

export function mergeConversationSourceMessages(
  ...messageSets: JmapEmailMessage[][]
): JmapEmailMessage[] {
  const byId = new Map<string, JmapEmailMessage>();
  for (const messageSet of messageSets) {
    for (const message of messageSet) {
      const existing = byId.get(message.id);
      byId.set(
        message.id,
        existing ? mergeMailMessage(existing, message) : message,
      );
    }
  }
  return [...byId.values()].sort(
    (left, right) => getReceivedAtTime(left) - getReceivedAtTime(right),
  );
}

export function filterRelatedThreadMessages(
  mailboxMessages: JmapEmailMessage[],
  relatedMessages: JmapEmailMessage[],
): JmapEmailMessage[] {
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

export function buildMailboxThreadRows(
  mailboxMessages: JmapEmailMessage[],
  relatedMessages: JmapEmailMessage[] = [],
): MailConversation[] {
  const extras = filterRelatedThreadMessages(mailboxMessages, relatedMessages);
  const conversations = buildMailConversations([
    ...mailboxMessages,
    ...extras,
  ]);
  const primaryIdSet = new Set(mailboxMessages.map((message) => message.id));

  const rows: MailConversation[] = [];
  for (const conversation of conversations) {
    const primaryMessages = conversation.messages.filter((message) =>
      primaryIdSet.has(message.id),
    );
    if (primaryMessages.length === 0) continue;

    const latestPrimary = primaryMessages.reduce((latest, candidate) =>
      getReceivedAtTime(candidate) >= getReceivedAtTime(latest)
        ? candidate
        : latest,
    );

    rows.push({ ...conversation, latestMessage: latestPrimary });
  }

  return rows;
}

export function getConversationForMessage(
  messages: JmapEmailMessage[],
  messageId: string | null | undefined,
): JmapEmailMessage[] {
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
