export const mailQueryKeys = {
  all: ["mail"] as const,
  messages: () => [...mailQueryKeys.all, "messages"] as const,
  mailboxMessages: (mailboxId: string | null) =>
    [...mailQueryKeys.messages(), mailboxId] as const,
  message: (messageId: string) =>
    [...mailQueryKeys.all, "message", messageId] as const,
  inlineSearch: (mailboxId: string | null, query: string) =>
    [...mailQueryKeys.all, "inline-search", mailboxId, query] as const,
} as const;

export type MailMailboxMessagesCache = {
  messages: import("@/lib/mail/types").JmapEmailMessage[];
  total: number;
};
