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
  hiddenMailboxIds: () => [...mailQueryKeys.all, "hiddenMailboxIds"] as const,
  syncedSettings: (userId: string | null) =>
    [...mailQueryKeys.all, "syncedSettings", userId] as const,
} as const;

export type MailMailboxMessagesCache = {
  messages: import("@/lib/mail/types").JmapEmailMessage[];
  total: number;
};
