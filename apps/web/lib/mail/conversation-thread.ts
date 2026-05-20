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

function getConversationTokens(message: JmapEmailMessage): string[] {
  const tokens = new Set<string>();

  if (message.threadId) {
    tokens.add(`thread:${normalizeConversationToken(message.threadId)}`);
  }

  for (const value of [
    ...(message.messageId ?? []),
    ...(message.inReplyTo ?? []),
    ...(message.references ?? []),
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

export function getConversationForMessage(
  messages: JmapEmailMessage[],
  messageId: string | null | undefined,
): JmapEmailMessage[] {
  if (!messageId) {
    return [];
  }

  const conversation = buildMailConversations(messages).find((entry) =>
    entry.messageIds.includes(messageId),
  );

  return conversation?.messages ?? [];
}
