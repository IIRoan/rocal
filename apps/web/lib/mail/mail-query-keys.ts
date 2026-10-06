export const mailQueryKeys = {
  all: ["mail"] as const,
  config: () => [...mailQueryKeys.all, "config"] as const,
  accountStatus: (userId: string) =>
    [...mailQueryKeys.all, "account-status", userId] as const,
  messages: () => [...mailQueryKeys.all, "messages"] as const,
  mailboxMessages: (mailboxId: string | null) =>
    [...mailQueryKeys.messages(), mailboxId] as const,
  message: (messageId: string) =>
    [...mailQueryKeys.all, "message", messageId] as const,
  inlineSearch: (mailboxId: string | null, query: string) =>
    [...mailQueryKeys.all, "inline-search", mailboxId, query] as const,
  inlineSearchWithFilters: (
    mailboxId: string | null,
    query: string,
    filters: MailSearchFilters,
  ) =>
    [
      ...mailQueryKeys.all,
      "inline-search",
      mailboxId,
      query,
      filters,
    ] as const,
  messageWithBody: (messageId: string, requireBody: boolean) =>
    [
      ...mailQueryKeys.message(messageId),
      requireBody ? "full" : "preview",
    ] as const,
  hiddenMailboxIds: () => [...mailQueryKeys.all, "hiddenMailboxIds"] as const,
  syncedSettings: (userId: string | null) =>
    [...mailQueryKeys.all, "syncedSettings", userId] as const,
} as const;

import type { MailSearchFilters } from "@/lib/mail/mail-search-filter";
import type { JmapEmailMessage } from "@/lib/mail/types";

export type MailMailboxMessagesCache = {
  messages: JmapEmailMessage[];
  total: number;
};
