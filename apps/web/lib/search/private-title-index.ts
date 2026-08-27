import type {
  TitleIndexDocument,
  TitleIndexShardPayload,
} from "@workspace/calendar-core";
import {
  decryptSearchShard,
  encryptSearchShard,
  eventToTitleIndexDocument,
  mailToTitleIndexDocument,
} from "@workspace/calendar-core";
import { calendarApiService } from "@/lib/calendar-api-service";
import { mailDemoApiService } from "@/lib/mail/api-service";
import { StalwartJmapClient } from "@/lib/mail/jmap-client";
import { createMailOAuthTokenManager } from "@/lib/mail/oauth-client";
import type { JmapEmailMessage, JmapMailbox, JmapSession } from "@/lib/mail/types";
import {
  BrowserSearchIndexStore,
  TITLE_INDEX_SHARD_ID,
  titleIndexAdditionalData,
} from "./local-index-store";

const TITLE_PAGE_SIZE = 100;
const MAX_MAIL_PER_MAILBOX = 800;
const MAX_MAILBOXES = 12;
const MAX_MAIL_TITLES = 6000;

const store = new BrowserSearchIndexStore();

export type PrivateTitleIndexSnapshot = {
  documents: TitleIndexDocument[];
  indexedAt: string | null;
  itemCount: number;
};

const EMPTY_SNAPSHOT: PrivateTitleIndexSnapshot = {
  documents: [],
  indexedAt: null,
  itemCount: 0,
};

function sortMailboxes(mailboxes: JmapMailbox[]): JmapMailbox[] {
  const priority: Record<string, number> = {
    inbox: 0,
    archive: 1,
    sent: 2,
    drafts: 3,
    junk: 4,
    trash: 5,
  };
  return mailboxes.slice().sort((left, right) => {
    const leftPriority = priority[left.role?.toLowerCase() ?? ""] ?? 10;
    const rightPriority = priority[right.role?.toLowerCase() ?? ""] ?? 10;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.name.localeCompare(right.name);
  });
}

async function loadCalendarTitleDocuments(
  signal?: AbortSignal,
): Promise<TitleIndexDocument[]> {
  const documents: TitleIndexDocument[] = [];
  let offset = 0;

  do {
    const page = await calendarApiService.getEventSearchCorpus(
      { limit: TITLE_PAGE_SIZE, offset },
      signal,
    );
    for (const event of page.events) {
      const document = eventToTitleIndexDocument(event);
      if (document) documents.push(document);
    }
    offset = page.nextOffset ?? -1;
  } while (offset >= 0 && !signal?.aborted);

  return documents;
}

async function loadMailTitleDocuments(
  client: StalwartJmapClient,
  session: JmapSession,
): Promise<TitleIndexDocument[]> {
  const mailboxes = sortMailboxes(await client.getMailboxes(session)).slice(
    0,
    MAX_MAILBOXES,
  );
  const unique = new Map<string, TitleIndexDocument>();

  for (const mailbox of mailboxes) {
    if (unique.size >= MAX_MAIL_TITLES) break;
    let position = 0;
    let loadedForMailbox = 0;
    let total = Number.POSITIVE_INFINITY;

    while (
      loadedForMailbox < MAX_MAIL_PER_MAILBOX &&
      position < total &&
      unique.size < MAX_MAIL_TITLES
    ) {
      const page = await client.getMailboxMessageIds(session, mailbox.id, {
        limit: TITLE_PAGE_SIZE,
        position,
      });
      total = page.total;
      if (page.ids.length === 0) break;

      const messages = await client.getMessagesByIds(session, page.ids, {
        includeBodies: false,
      });
      for (const message of messages) {
        unique.set(message.id, mailToTitleIndexDocument(message));
      }
      loadedForMailbox += page.ids.length;
      position += page.ids.length;
    }
  }

  return Array.from(unique.values());
}

async function tryCreateMailClient(): Promise<{
  client: StalwartJmapClient;
  session: JmapSession;
} | null> {
  try {
    const config = await mailDemoApiService.getConfig();
    const tokenManager = createMailOAuthTokenManager(config.oauth);
    const client = new StalwartJmapClient({
      baseUrl: config.discoveryBaseUrl,
      getAccessToken: () => tokenManager.getAccessToken(),
      onUnauthorized: async () => {
        tokenManager.clear();
        try {
          await tokenManager.getAccessToken();
        } catch {
          // Indexing can continue with calendar titles only.
        }
      },
    });
    const session = await client.discoverSession();
    return { client, session };
  } catch {
    return null;
  }
}

export async function loadPrivateTitleIndex(
  accountId: string,
): Promise<PrivateTitleIndexSnapshot> {
  try {
    const key = await store.getOrCreateKey();
    const record = await store.get(TITLE_INDEX_SHARD_ID);
    if (!record) return EMPTY_SNAPSHOT;

    const payload = await decryptSearchShard<TitleIndexShardPayload>(
      key,
      record.shard,
      { additionalData: titleIndexAdditionalData(accountId) },
    );

    return {
      documents: payload.documents,
      indexedAt: payload.indexedAt,
      itemCount: payload.documents.length,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export async function rebuildPrivateTitleIndex(input: {
  accountId: string;
  signal?: AbortSignal;
}): Promise<PrivateTitleIndexSnapshot> {
  const [calendarDocuments, mailClient] = await Promise.all([
    loadCalendarTitleDocuments(input.signal),
    tryCreateMailClient(),
  ]);

  const mailDocuments = mailClient
    ? await loadMailTitleDocuments(mailClient.client, mailClient.session)
    : [];

  const documents = [...calendarDocuments, ...mailDocuments];
  const payload: TitleIndexShardPayload = {
    documents,
    indexedAt: new Date().toISOString(),
  };
  const key = await store.getOrCreateKey();
  const shard = await encryptSearchShard(key, payload, {
    additionalData: titleIndexAdditionalData(input.accountId),
    itemCount: documents.length,
  });

  await store.put({
    id: TITLE_INDEX_SHARD_ID,
    source: "title",
    accountId: input.accountId,
    shard,
  });

  return {
    documents,
    indexedAt: payload.indexedAt,
    itemCount: documents.length,
  };
}

export function mailDocumentToMessageStub(
  document: TitleIndexDocument,
): JmapEmailMessage {
  return {
    id: document.messageId ?? document.id.replace(/^mail:/, ""),
    subject: document.title,
    threadId: document.threadId,
    receivedAt: document.timestamp,
    mailboxIds: Object.fromEntries(
      (document.mailboxIds ?? []).map((id) => [id, true] as const),
    ),
    from: document.from
      ? [{ name: document.from, email: document.from }]
      : undefined,
  };
}
