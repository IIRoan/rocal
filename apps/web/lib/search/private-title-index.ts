import type {
  TitleIndexDocument,
  TitleIndexShardPayload,
} from "@workspace/calendar-core";
import {
  buildMailBodyExcerpt,
  decryptSearchShard,
  encryptSearchShard,
  eventToTitleIndexDocument,
  mailToTitleIndexDocument,
  refreshMailBodyExcerpts,
  runTasksWithConcurrencyLimit,
} from "@workspace/calendar-core";
import { calendarApiService } from "@/lib/calendar-api-service";
import { mailDemoApiService } from "@/lib/mail/api-service";
import { StalwartJmapClient } from "@/lib/mail/jmap-client";
import { decryptMessageForCompose } from "@/lib/mail/decrypt-message-for-compose";
import { getEncryptionSession } from "@/lib/e2ee-payloads";
import { getActiveE2eeSession } from "@/lib/e2ee-session";
import {
  getStoredDerivedVaultKey,
  putStoredDerivedVaultKey,
} from "@/lib/mail/derived-vault-key-storage";
import { unwrapVaultSecret } from "@/lib/mail/vault-secret";
import {
  unlockEncryptedMailVault,
  unlockEncryptedMailVaultWithDerivedKey,
} from "@/lib/mail/vault-crypto";
import { getStoredMailVault } from "@/lib/mail/vault-storage";
import { mailCryptoWorkerClient } from "@/lib/mail/worker-client";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "@/lib/mail/message-security";
import { createMailOAuthTokenManager } from "@/lib/mail/oauth-client";
import type {
  JmapEmailMessage,
  JmapMailbox,
  JmapSession,
} from "@/lib/mail/types";
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
  /** Mail whose body excerpt is not indexed yet. */
  pendingBodies: number;
  loadedBodies: number;
};

const EMPTY_SNAPSHOT: PrivateTitleIndexSnapshot = {
  documents: [],
  indexedAt: null,
  itemCount: 0,
  pendingBodies: 0,
  loadedBodies: 0,
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
      const pageSize = page.ids.length;
      if (pageSize === 0) break;

      const messages = await client.getMessagesByIds(session, page.ids, {
        includeBodies: false,
      });
      for (const message of messages) {
        unique.set(message.id, mailToTitleIndexDocument(message));
      }
      loadedForMailbox += pageSize;
      position += pageSize;
    }
  }

  return Array.from(unique.values());
}

async function messageBodyExcerpt(
  client: StalwartJmapClient,
  session: JmapSession,
  message: JmapEmailMessage,
  ensureVault: () => Promise<void>,
): Promise<string> {
  if (classifyMessageEncryption(message) === "plain") {
    return buildMailBodyExcerpt(extractMessageBodies(message));
  }
  await ensureVault();
  const decrypted = await decryptMessageForCompose({
    client,
    session,
    message,
    config: null,
  });
  return buildMailBodyExcerpt(decrypted);
}

async function loadMailVault(accountId: string): Promise<void> {
  const encryptionSession = await getEncryptionSession();
  if (encryptionSession?.userId !== accountId) {
    throw new Error("Account encryption key is unavailable.");
  }
  const [remoteBackup, cachedKey] = await Promise.all([
    mailDemoApiService.getAccountVaultBackup().catch(() => null),
    getStoredDerivedVaultKey(accountId).catch(() => null),
  ]);
  const backup =
    remoteBackup ??
    (await getStoredMailVault(
      (await mailDemoApiService.getAccountStatus()).email,
    ));
  if (!backup?.wrappedSecret) throw new Error("Mail vault is unavailable.");
  const secret = await unwrapVaultSecret(backup.wrappedSecret);
  if (!secret) throw new Error("Mail vault is locked.");
  let vault = cachedKey
    ? await unlockEncryptedMailVaultWithDerivedKey(
        backup.encryptedVaultB64,
        cachedKey,
      ).catch(() => null)
    : null;
  if (!vault) {
    vault = await unlockEncryptedMailVault(
      backup.encryptedVaultB64,
      secret,
      backup.kdfParams,
      (key) => {
        void putStoredDerivedVaultKey(accountId, key).catch(() => undefined);
      },
    );
  }
  if (getActiveE2eeSession() !== encryptionSession) {
    throw new Error("Account encryption session changed.");
  }
  await mailCryptoWorkerClient.loadVault({
    privateKeyArmored: vault.encryptedPrivateKeyArmored,
    privateKeyPassphrase: secret,
    publicKeyArmored: vault.publicKeyArmored,
  });
}

/** Decrypts one message at a time so indexing never holds several bodies in memory. */
function createBodyLoader(
  client: StalwartJmapClient,
  session: JmapSession,
  accountId: string,
) {
  let vaultReady: Promise<void> | undefined;
  const ensureVault = () => (vaultReady ??= loadMailVault(accountId));
  return async (batch: TitleIndexDocument[]): Promise<Map<string, string>> => {
    const ids = batch.flatMap((document) =>
      document.messageId ? [document.messageId] : [],
    );
    const messages = await client.getMessagesByIds(session, ids);
    const excerpts = new Map<string, string>();
    await runTasksWithConcurrencyLimit(
      messages.map((message) => async () => {
        try {
          excerpts.set(
            `mail:${message.id}`,
            await messageBodyExcerpt(client, session, message, ensureVault),
          );
        } catch {
          // Left out so the pass can tell unreadable messages from a locked vault.
        }
      }),
      1,
    );
    return excerpts;
  };
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
      pendingBodies: 0,
      loadedBodies: 0,
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

  const mailTitles = mailClient
    ? await loadMailTitleDocuments(mailClient.client, mailClient.session)
    : [];
  const {
    documents: mailDocuments,
    pending: pendingBodies,
    loaded: loadedBodies,
  } = mailClient
    ? await refreshMailBodyExcerpts({
        documents: mailTitles,
        previous: (await loadPrivateTitleIndex(input.accountId)).documents,
        loadBodies: createBodyLoader(
          mailClient.client,
          mailClient.session,
          input.accountId,
        ),
      })
    : { documents: mailTitles, pending: 0, loaded: 0 };

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
    pendingBodies,
    loadedBodies,
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
