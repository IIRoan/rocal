import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  flattenMailboxMessagesCache,
  type MailboxMessagesCacheData,
  type MailboxMessagesInfiniteData,
} from "./mail-message-cache";
import { MAILBOX_MESSAGES_PAGE_SIZE } from "./mail-pagination";
import {
  restoreMailRuntime,
  toPersistedMailRuntime,
  type MailRuntime,
  type PersistedMailRuntime,
} from "./mail-runtime";
import type { MailDecryptResult } from "./mail-crypto";
import { listPreviewSnippet } from "./mail-preview";
import { classifyMessageEncryption } from "./message-security";
import type { JmapEmailMessage, LabelDef, MailAccountStatus } from "./types";

export const MAIL_OFFLINE_SNAPSHOT_VERSION = 2;
const MAX_LISTS = 6;
const MAX_MESSAGES_PER_LIST = MAILBOX_MESSAGES_PAGE_SIZE;
const MAX_THREADS = 20;
const MAX_BODY_VALUE_CHARS = 16_000;
const MAX_DECRYPTED_CHARS = 64_000;
const MAX_DECRYPTED_TOTAL_CHARS = 1_500_000;
const MAX_PARTIAL_PREVIEW_CHARS = 500;

export type MailOfflineList = {
  mailboxId: string;
  total: number;
  messages: JmapEmailMessage[];
};

export type MailOfflineThread = {
  threadId: string;
  messages: JmapEmailMessage[];
};

export type MailOfflineDecrypted = {
  messageId: string;
  result: MailDecryptResult;
  /** Preview-only copy (too large or had attachment bytes); hydrated stale so it is decrypted again when shown. */
  partial: boolean;
};

export type MailOfflineSnapshot = {
  version: typeof MAIL_OFFLINE_SNAPSHOT_VERSION;
  userId: string;
  savedAt: number;
  /** JMAP Email state every saved list is at least as new as; background sync diffs from here. */
  emailState: string | null;
  account: MailAccountStatus;
  runtime: PersistedMailRuntime;
  lists: MailOfflineList[];
  threads: MailOfflineThread[];
  /** Decrypted bodies of saved messages only, so encrypted previews and readers render before the vault unlocks. */
  decrypted: MailOfflineDecrypted[];
  labels: LabelDef[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Shape guard for decrypted snapshots; AES-GCM already authenticates them, this rejects older formats. */
export function isMailOfflineSnapshot(
  value: unknown,
): value is MailOfflineSnapshot {
  if (!isRecord(value)) return false;
  return (
    value.version === MAIL_OFFLINE_SNAPSHOT_VERSION &&
    typeof value.userId === "string" &&
    typeof value.savedAt === "number" &&
    (value.emailState === null || typeof value.emailState === "string") &&
    isRecord(value.account) &&
    isRecord(value.runtime) &&
    isRecord(value.runtime.config) &&
    isRecord(value.runtime.session) &&
    Array.isArray(value.runtime.mailboxes) &&
    Array.isArray(value.lists) &&
    value.lists.every(
      (list) =>
        isRecord(list) &&
        typeof list.mailboxId === "string" &&
        Array.isArray(list.messages),
    ) &&
    Array.isArray(value.threads) &&
    Array.isArray(value.decrypted) &&
    value.decrypted.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.messageId === "string" &&
        typeof entry.partial === "boolean" &&
        isRecord(entry.result) &&
        typeof entry.result.plaintext === "string",
    ) &&
    (value.labels === null || Array.isArray(value.labels))
  );
}

/** `["mail", "messages", mailboxId]` only; search results and the null placeholder key are never saved. */
export function isMailboxListKey(key: QueryKey): boolean {
  return (
    key.length === 3 &&
    key[0] === "mail" &&
    key[1] === "messages" &&
    typeof key[2] === "string"
  );
}

function isThreadKey(key: QueryKey): boolean {
  return (
    key.length === 3 &&
    key[0] === "mail" &&
    key[1] === "thread" &&
    typeof key[2] === "string"
  );
}

/** Whether a cache change can alter what the snapshot would contain. */
export function isMailOfflineSnapshotKey(key: QueryKey): boolean {
  if (key[0] !== "mail") return false;
  return (
    key[1] === "account" ||
    key[1] === "runtime" ||
    key[1] === "labels" ||
    key[1] === "decrypted" ||
    key[1] === "message" ||
    isMailboxListKey(key) ||
    isThreadKey(key)
  );
}

/** Row copies carry no `bodyValues` at all, and snapshot copies may have capped ones; neither can render a reader. */
export function hasIncompleteBody(message: JmapEmailMessage): boolean {
  return (
    !message.bodyValues ||
    Object.values(message.bodyValues).some((value) => value.isTruncated === true)
  );
}

/** Caps large plaintext bodies; readers refetch incomplete messages, and PGP ciphertext is kept whole so previews still decrypt. */
export function compactOfflineMessage(
  message: JmapEmailMessage,
): JmapEmailMessage {
  const bodyValues = message.bodyValues;
  if (!bodyValues || classifyMessageEncryption(message) !== "plain") {
    return message;
  }
  let changed = false;
  const compacted: typeof bodyValues = {};
  for (const [partId, value] of Object.entries(bodyValues)) {
    const text = value.value ?? "";
    if (text.length > MAX_BODY_VALUE_CHARS) {
      changed = true;
      compacted[partId] = {
        value: text.slice(0, MAX_BODY_VALUE_CHARS),
        isTruncated: true,
      };
    } else {
      compacted[partId] = value;
    }
  }
  return changed ? { ...message, bodyValues: compacted } : message;
}

/** Rows carry no body text; attach the bodies of messages already opened or prefetched so they still open offline. */
function withLoadedBody(
  queryClient: QueryClient,
  message: JmapEmailMessage,
): JmapEmailMessage {
  if (message.bodyValues) return compactOfflineMessage(message);
  const detail = queryClient.getQueryData<JmapEmailMessage | null>(
    QUERY_KEYS.mailMessage(message.id),
  );
  if (!detail?.bodyValues) return message;
  return compactOfflineMessage({ ...message, bodyValues: detail.bodyValues });
}

function isReconciledQuery(query: Query): boolean {
  return (
    query.state.status === "success" &&
    !query.state.isInvalidated &&
    query.state.fetchStatus === "idle"
  );
}

function newestFirst(a: Query, b: Query): number {
  return b.state.dataUpdatedAt - a.state.dataUpdatedAt;
}

function listTotal(data: MailboxMessagesCacheData): number {
  return "pages" in data ? (data.pages[0]?.total ?? 0) : data.total;
}

function decryptedSize(result: MailDecryptResult): number {
  return result.plaintext.length + (result.html?.length ?? 0);
}

/** Decrypted attachment bytes do not survive JSON and are too large to keep. */
function hasAttachmentContent(result: MailDecryptResult): boolean {
  return (result.attachments ?? []).some((attachment) => attachment.content != null);
}

/** Decrypted content for saved messages only, so removed mail never keeps a plaintext copy on disk. */
function captureDecrypted(
  queryClient: QueryClient,
  messages: JmapEmailMessage[],
): MailOfflineDecrypted[] {
  const cache = queryClient.getQueryCache();
  const seen = new Set<string>();
  const entries: MailOfflineDecrypted[] = [];
  let budget = MAX_DECRYPTED_TOTAL_CHARS;

  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    const query = cache.find<MailDecryptResult>({
      queryKey: QUERY_KEYS.mailDecrypted(message.id),
      exact: true,
    });
    const result = query?.state.data;
    if (!query || query.state.status !== "success" || !result) continue;

    const size = decryptedSize(result);
    // Hydrated partial copies stay invalidated until re-decrypted, so they are never promoted to full.
    const full =
      !query.state.isInvalidated &&
      size <= MAX_DECRYPTED_CHARS &&
      size <= budget &&
      !hasAttachmentContent(result);
    if (full) {
      budget -= size;
      entries.push({ messageId: message.id, result, partial: false });
      continue;
    }

    const preview = listPreviewSnippet(message, {
      text: result.plaintext,
      html: result.html,
    }).slice(0, MAX_PARTIAL_PREVIEW_CHARS);
    if (!preview) continue;
    entries.push({
      messageId: message.id,
      partial: true,
      result: {
        plaintext: preview,
        html: null,
        signatureVerificationState: result.signatureVerificationState,
        hasVerifiedSignature: result.hasVerifiedSignature,
      },
    });
  }
  return entries;
}

/** Builds the snapshot from what the screens already loaded; null until a provisioned mailbox is connected. */
export function captureMailOfflineSnapshot(
  queryClient: QueryClient,
  input: { userId: string; emailState: string | null; now?: number },
): MailOfflineSnapshot | null {
  const account = queryClient.getQueryData<MailAccountStatus>(
    QUERY_KEYS.mailAccount(),
  );
  const runtime = queryClient.getQueryData<MailRuntime>(
    QUERY_KEYS.mailRuntime(),
  );
  if (!account?.provisioned || !runtime) return null;

  const cache = queryClient.getQueryCache();
  const listQueries = cache
    .findAll({ queryKey: QUERY_KEYS.mailMessagesAll() })
    .filter(
      (query) => isMailboxListKey(query.queryKey) && query.state.data != null,
    )
    .sort(newestFirst)
    .slice(0, MAX_LISTS);
  const lists = listQueries.map((query): MailOfflineList => {
    const data = query.state.data as MailboxMessagesCacheData;
    return {
      mailboxId: query.queryKey[2] as string,
      total: listTotal(data),
      messages: flattenMailboxMessagesCache(data)
        .slice(0, MAX_MESSAGES_PER_LIST)
        .map((entry) => withLoadedBody(queryClient, entry)),
    };
  });

  // Only threads of saved rows matter on launch; threads prefetched for older rows would crowd them out.
  const listThreadIds = new Set(
    lists.flatMap((list) => list.messages.map((entry) => entry.threadId)),
  );
  const threadQueries = cache
    .findAll({ queryKey: QUERY_KEYS.mailThreadsAll() })
    .filter(
      (query) =>
        isThreadKey(query.queryKey) &&
        query.state.data != null &&
        listThreadIds.has(query.queryKey[2] as string),
    )
    .sort(newestFirst)
    .slice(0, MAX_THREADS);
  const threads = threadQueries.map(
    (query): MailOfflineThread => ({
      threadId: query.queryKey[2] as string,
      messages: (query.state.data as JmapEmailMessage[]).map((entry) =>
        withLoadedBody(queryClient, entry),
      ),
    }),
  );

  const decrypted = captureDecrypted(queryClient, [
    ...lists.flatMap((list) => list.messages),
    ...threads.flatMap((thread) => thread.messages),
  ]);

  return {
    version: MAIL_OFFLINE_SNAPSHOT_VERSION,
    userId: input.userId,
    savedAt: input.now ?? Date.now(),
    // Retain stale mail for offline use, but never claim it already includes the latest server changes.
    emailState: [...listQueries, ...threadQueries].every(isReconciledQuery)
      ? input.emailState
      : null,
    account,
    runtime: toPersistedMailRuntime(runtime),
    lists,
    threads,
    decrypted,
    labels:
      queryClient.getQueryData<LabelDef[]>(QUERY_KEYS.mailLabels()) ?? null,
  };
}

/** Seeds the query cache so the mailbox renders before any network call; never overwrites live data. */
export function hydrateMailOfflineSnapshot(
  queryClient: QueryClient,
  snapshot: MailOfflineSnapshot,
  now = Date.now(),
): void {
  const seed = (key: QueryKey, data: unknown, updatedAt: number) => {
    if (queryClient.getQueryData(key) !== undefined) return;
    queryClient.setQueryData(key, data, { updatedAt });
  };

  // Account and runtime keep their saved age so their normal stale times refresh them in the background.
  seed(QUERY_KEYS.mailAccount(), snapshot.account, snapshot.savedAt);
  seed(QUERY_KEYS.mailConfig(), snapshot.runtime.config, snapshot.savedAt);
  seed(
    QUERY_KEYS.mailRuntime(),
    restoreMailRuntime(snapshot.runtime),
    snapshot.savedAt,
  );

  // Only a reconciled snapshot can rely on Email/changes instead of a full refetch.
  const listUpdatedAt = snapshot.emailState === null ? 0 : now;
  for (const list of snapshot.lists) {
    const data: MailboxMessagesInfiniteData = {
      pages: [{ messages: list.messages, total: list.total, position: 0 }],
      pageParams: [0],
    };
    seed(QUERY_KEYS.mailMessages(list.mailboxId), data, listUpdatedAt);
  }
  for (const thread of snapshot.threads) {
    seed(
      QUERY_KEYS.mailThread(thread.threadId),
      thread.messages,
      listUpdatedAt,
    );
  }

  // Labels keep their saved age; the session refreshes them once the vault unlocks.
  if (snapshot.labels) {
    seed(QUERY_KEYS.mailLabels(), snapshot.labels, snapshot.savedAt);
  }

  // A message's ciphertext never changes, so a full decrypted copy stays valid for as long as the message exists.
  for (const entry of snapshot.decrypted) {
    const key = QUERY_KEYS.mailDecrypted(entry.messageId);
    if (queryClient.getQueryData(key) !== undefined) continue;
    queryClient.setQueryData(key, entry.result, { updatedAt: now });
    if (entry.partial) {
      void queryClient.invalidateQueries({
        queryKey: key,
        exact: true,
        refetchType: "none",
      });
    }
  }
}
