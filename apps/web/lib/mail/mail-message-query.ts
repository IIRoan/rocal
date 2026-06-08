import type { QueryClient } from "@tanstack/react-query";
import type { JmapEmailMessage, JmapSession } from "@/lib/mail/types";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
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
    queryClient.setQueryData(mailQueryKeys.message(message.id), message);
  }
}

export function mergeMessageIntoMailboxCaches(
  queryClient: QueryClient,
  message: JmapEmailMessage,
): void {
  queryClient.setQueryData(mailQueryKeys.message(message.id), message);

  const mailboxLists = queryClient.getQueriesData<MailMailboxMessagesCache>({
    queryKey: mailQueryKeys.messages(),
  });

  for (const [key, data] of mailboxLists) {
    if (!data) continue;
    const messages = mergeUniqueMessages(data.messages, [message]);
    queryClient.setQueryData(key, {
      ...data,
      messages,
    });
  }
}

export async function fetchMailMessageById(
  queryClient: QueryClient,
  input: {
    client: StalwartJmapClient;
    session: JmapSession;
    messageId: string;
  },
): Promise<JmapEmailMessage> {
  const cached = findCachedMailMessage(queryClient, input.messageId);
  if (cached) {
    return cached;
  }

  return queryClient.fetchQuery({
    queryKey: mailQueryKeys.message(input.messageId),
    queryFn: async () => {
      const [message] = await input.client.getMessagesByIds(input.session, [
        input.messageId,
      ]);
      if (!message) {
        throw new Error("Message not found");
      }
      return message;
    },
    staleTime: 60_000,
  });
}
