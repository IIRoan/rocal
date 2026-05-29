import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type { JmapEmailMessage, JmapSession } from "@/lib/mail/types";
import { extractMessageBodies } from "@/lib/mail/message-security";
import {
  encryptSearchShard,
  type EncryptedSearchShard,
} from "./local-index-store";

export type MailSearchDocument = {
  id: string;
  threadId?: string;
  subject?: string | null;
  from: string;
  to: string;
  body: string;
  receivedAt?: string;
  mailboxIds: string[];
  attachmentNames: string[];
};

export type MailSearchCorpusSnapshot = {
  messages: JmapEmailMessage[];
  total: number;
  queryState?: string;
  indexedAt: string;
};

export async function loadMailboxSearchCorpus(input: {
  client: StalwartJmapClient;
  session: JmapSession;
  mailboxId: string;
  pageSize?: number;
  maxMessages?: number;
}): Promise<MailSearchCorpusSnapshot> {
  const pageSize = Math.min(Math.max(input.pageSize ?? 100, 1), 200);
  const maxMessages = Math.max(input.maxMessages ?? 1000, 1);
  const messages: JmapEmailMessage[] = [];
  let position = 0;
  let total = 0;
  let queryState: string | undefined;

  while (messages.length < maxMessages) {
    const page = await input.client.getMailboxMessagesForIndex(
      input.session,
      input.mailboxId,
      { limit: pageSize, position },
    );
    messages.push(...page.messages);
    total = page.total;
    queryState = page.queryState ?? queryState;

    position += page.messages.length;
    if (page.messages.length === 0 || position >= total) break;
  }

  return {
    messages,
    total,
    queryState,
    indexedAt: new Date().toISOString(),
  };
}

export function messageToMailSearchDocument(
  message: JmapEmailMessage,
): MailSearchDocument {
  const bodies = extractMessageBodies(message);
  const formatAddresses = (
    addresses: NonNullable<JmapEmailMessage["from"]> | undefined,
  ) =>
    (addresses ?? [])
      .map((address) => `${address.name ?? ""} ${address.email ?? ""}`.trim())
      .join(" ");

  return {
    id: message.id,
    threadId: message.threadId,
    subject: message.subject,
    from: formatAddresses(message.from),
    to: formatAddresses([
      ...(message.to ?? []),
      ...(message.cc ?? []),
      ...(message.bcc ?? []),
    ]),
    body: bodies.text ?? bodies.html ?? "",
    receivedAt: message.receivedAt,
    mailboxIds: Object.keys(message.mailboxIds ?? {}),
    attachmentNames: (message.attachments ?? []).flatMap((attachment) =>
      attachment.name ? [attachment.name] : [],
    ),
  };
}

export async function encryptMailSearchShard(input: {
  key: CryptoKey;
  accountId: string;
  mailboxId: string;
  messages: JmapEmailMessage[];
}): Promise<EncryptedSearchShard> {
  const documents = input.messages.map(messageToMailSearchDocument);
  return encryptSearchShard(input.key, { documents }, {
    additionalData: `mail:${input.accountId}:${input.mailboxId}`,
    itemCount: documents.length,
  });
}
