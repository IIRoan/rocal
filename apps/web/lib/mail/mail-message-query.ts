import type { QueryClient } from "@tanstack/react-query";
import type { JmapEmailMessage, JmapSession } from "@/lib/mail/types";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import {
  mergeMailMessage,
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

  const mailboxLists = queryClient.getQueriesData<MailMailboxMessagesCache>({
    queryKey: mailQueryKeys.messages(),
  });

  for (const [key, data] of mailboxLists) {
    if (!data) continue;
    const messages = data.messages.map((entry) =>
      entry.id === merged.id ? mergeMailMessage(entry, merged) : entry,
    );
    const hasMessage = messages.some((entry) => entry.id === merged.id);
    queryClient.setQueryData(key, {
      ...data,
      messages: hasMessage ? messages : mergeUniqueMessages(data.messages, [merged]),
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
      const merged = existing ? mergeMailMessage(existing, message) : message;
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
