import type { QueryClient } from "@tanstack/react-query";
import type { JmapEmailMessage } from "./types";
import {
  mailQueryKeys,
  type MailMailboxMessagesCache,
} from "./mail-query-keys";
import { sortMessagesByReceivedAt } from "./mail-list-merge";

export function replaceSavedDraftInMailboxList(
  queryClient: QueryClient,
  input: {
    draftsMailboxId: string;
    previousDraftId: string | null;
    savedDraft: JmapEmailMessage;
  },
): void {
  const { draftsMailboxId, previousDraftId, savedDraft } = input;

  queryClient.setQueryData(
    mailQueryKeys.message(savedDraft.id),
    savedDraft,
  );

  if (previousDraftId && previousDraftId !== savedDraft.id) {
    queryClient.removeQueries({
      queryKey: mailQueryKeys.message(previousDraftId),
    });
  }

  const mailboxLists = queryClient.getQueriesData<MailMailboxMessagesCache>({
    queryKey: mailQueryKeys.messages(),
  });

  for (const [key, data] of mailboxLists) {
    if (!data) continue;
    const mailboxId = Array.isArray(key) ? String(key[2] ?? "") : "";
    if (mailboxId !== draftsMailboxId) continue;

    const withoutPrevious = previousDraftId
      ? data.messages.filter((message) => message.id !== previousDraftId)
      : data.messages.filter((message) => message.id !== savedDraft.id);

    const hasSaved = withoutPrevious.some(
      (message) => message.id === savedDraft.id,
    );
    const messages = sortMessagesByReceivedAt(
      hasSaved
        ? withoutPrevious.map((message) =>
            message.id === savedDraft.id ? savedDraft : message,
          )
        : [savedDraft, ...withoutPrevious],
    );

    const removedCount =
      previousDraftId && data.messages.some((m) => m.id === previousDraftId)
        ? 1
        : 0;
    const addedCount = hasSaved ? 0 : 1;

    queryClient.setQueryData(key, {
      ...data,
      messages,
      total: Math.max(data.total - removedCount + addedCount, messages.length),
    });
  }
}

export function buildDraftListPreview(input: {
  id: string;
  draftsMailboxId: string;
  subject: string;
  preview: string;
  fromEmail: string;
  fromName?: string | null;
  to: string[];
  receivedAt?: string;
}): JmapEmailMessage {
  return {
    id: input.id,
    subject: input.subject,
    preview: input.preview,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    keywords: { $draft: true },
    mailboxIds: { [input.draftsMailboxId]: true },
    from: [
      {
        email: input.fromEmail,
        ...(input.fromName ? { name: input.fromName } : {}),
      },
    ],
    to: input.to.map((email) => ({ email })),
  };
}
