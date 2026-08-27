import type { QueryClient } from "@tanstack/react-query";
import type { JmapEmailMessage, JmapSession } from "@/lib/mail/types";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import {
  mergeMailMessage,
  mergeMailMessagePreservingKeywords,
  messageHasLoadedBody,
} from "@/lib/mail/mail-message-body";
import {
  mailQueryKeys,
  type MailMailboxMessagesCache,
} from "@/lib/mail/mail-query-keys";

function mergeUniqueMessages(
  existing: JmapEmailMessage[],
  incoming: JmapEmailMessage[],
): JmapEmailMessage[] {
  const seen = new Set(existing.map((message) => message.id));
  const merged = [...existing];

  for (const message of incoming) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    merged.push(message);
  }

  return merged;
}

function mailboxIdFromMessagesQueryKey(
  queryKey: readonly unknown[],
): string | null {
  const mailboxId = queryKey[2];
  return typeof mailboxId === "string" && mailboxId.length > 0
    ? mailboxId
    : null;
}

function mailboxIdsForMessage(message: JmapEmailMessage): Set<string> {
  return new Set(
    Object.entries(message.mailboxIds ?? {})
      .filter(([, included]) => included)
      .map(([mailboxId]) => mailboxId),
  );
}

export function findCachedMailMessage(
  queryClient: QueryClient,
  messageId: string,
): JmapEmailMessage | undefined {
  const direct = queryClient.getQueryData<JmapEmailMessage>(
    mailQueryKeys.message(messageId),
  );
  if (direct) {
    return direct;
  }

  const mailboxLists = queryClient.getQueriesData<MailMailboxMessagesCache>({
    queryKey: mailQueryKeys.messages(),
  });

  for (const [, data] of mailboxLists) {
    const found = data?.messages.find((message) => message.id === messageId);
    if (found) {
      return found;
    }
  }

  return undefined;
}

export function seedMailMessageCache(
  queryClient: QueryClient,
  mailboxId: string,
  messages: JmapEmailMessage[],
  total: number,
): void {
  queryClient.setQueryData<MailMailboxMessagesCache>(
    mailQueryKeys.mailboxMessages(mailboxId),
    { messages, total },
  );

  for (const message of messages) {
    const existing = queryClient.getQueryData<JmapEmailMessage>(
      mailQueryKeys.message(message.id),
    );
    queryClient.setQueryData(
      mailQueryKeys.message(message.id),
      existing ? mergeMailMessage(existing, message) : message,
    );
  }
}

export function mergeMessageIntoMailboxCaches(
  queryClient: QueryClient,
  message: JmapEmailMessage,
): void {
  const existing = findCachedMailMessage(queryClient, message.id);
  const merged = existing ? mergeMailMessage(existing, message) : message;
  queryClient.setQueryData(mailQueryKeys.message(message.id), merged);

  const belongingIds = mailboxIdsForMessage(merged);
  const mailboxLists = queryClient.getQueriesData<MailMailboxMessagesCache>({
    queryKey: mailQueryKeys.messages(),
  });

  for (const [key, data] of mailboxLists) {
    if (!data) continue;
    const mailboxId = mailboxIdFromMessagesQueryKey(key);
    const alreadyPresent = data.messages.some((entry) => entry.id === merged.id);
    const belongsHere = Boolean(mailboxId && belongingIds.has(mailboxId));

    if (alreadyPresent && belongingIds.size > 0 && !belongsHere) {
      queryClient.setQueryData(key, {
        ...data,
        messages: data.messages.filter((entry) => entry.id !== merged.id),
        total: Math.max(0, data.total - 1),
      });
      continue;
    }

    if (alreadyPresent) {
      queryClient.setQueryData(key, {
        ...data,
        messages: data.messages.map((entry) =>
          entry.id === merged.id ? mergeMailMessage(entry, merged) : entry,
        ),
      });
      continue;
    }

    if (!belongsHere) continue;

    queryClient.setQueryData(key, {
      ...data,
      messages: mergeUniqueMessages(data.messages, [merged]),
      total: data.total + 1,
    });
  }
}

export async function fetchMailMessageById(
  queryClient: QueryClient,
  input: {
    client: StalwartJmapClient;
    session: JmapSession;
    messageId: string;
    requireBody?: boolean;
  },
): Promise<JmapEmailMessage> {
  const requireBody = input.requireBody ?? true;
  const cached = findCachedMailMessage(queryClient, input.messageId);
  if (cached && (!requireBody || messageHasLoadedBody(cached))) {
    return cached;
  }

  return queryClient.fetchQuery({
    queryKey: [
      ...mailQueryKeys.message(input.messageId),
      requireBody ? "full" : "preview",
    ],
    queryFn: async () => {
      const [message] = await input.client.getMessagesByIds(
        input.session,
        [input.messageId],
        { includeBodies: requireBody },
      );
      if (!message) {
        throw new Error("Message not found");
      }
      const existing = findCachedMailMessage(queryClient, input.messageId);
      const merged = existing
        ? mergeMailMessagePreservingKeywords(existing, message)
        : message;
      queryClient.setQueryData(mailQueryKeys.message(input.messageId), merged);
      return merged;
    },
    staleTime: 60_000,
  });
}

export async function prefetchMailMessageBodies(
  queryClient: QueryClient,
  input: {
    client: StalwartJmapClient;
    session: JmapSession;
    messageIds: string[];
  },
): Promise<void> {
  const idsToFetch = input.messageIds.filter((messageId) => {
    const cached = findCachedMailMessage(queryClient, messageId);
    return !cached || !messageHasLoadedBody(cached);
  });

  if (idsToFetch.length === 0) {
    return;
  }

  await Promise.all(
    idsToFetch.map((messageId) =>
      fetchMailMessageById(queryClient, {
        ...input,
        messageId,
        requireBody: true,
      }).then((message) => {
        mergeMessageIntoMailboxCaches(queryClient, message);
      }),
    ),
  );
}
