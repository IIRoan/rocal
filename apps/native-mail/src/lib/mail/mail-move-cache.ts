import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  collectMailboxRestores,
  type MailMailboxRestore,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  flattenMailboxMessagesCache,
  insertMessagesIntoMailboxCache,
  removeMessagesFromMailboxCache,
  patchMailboxMessagesCache,
  type MailboxMessagesCacheData,
} from "./mail-message-cache";
import type { JmapEmailMessage } from "./types";

/** Cache state captured before a move or delete, used to roll back a failure or undo a finished move. */
export interface MailMoveSnapshot {
  messageIds: string[];
  messages: JmapEmailMessage[];
  restores: MailMailboxRestore[];
  previousLists: [QueryKey, MailboxMessagesCacheData][];
  previousDetails: [QueryKey, JmapEmailMessage][];
  targetMailboxId: string | null;
}

function isTargetListKey(key: QueryKey, targetMailboxId: string | null) {
  return targetMailboxId !== null && key[2] === targetMailboxId;
}

/** Removes messages from every cached list except the target's; `targetMailboxId` null means a permanent delete. */
export function beginOptimisticMove(
  queryClient: QueryClient,
  messageIds: string[],
  targetMailboxId: string | null,
): MailMoveSnapshot {
  const idSet = new Set(messageIds);
  const found = new Map<string, JmapEmailMessage>();
  const previousDetails: MailMoveSnapshot["previousDetails"] = [];
  for (const messageId of messageIds) {
    const detail = queryClient.getQueryData<JmapEmailMessage | null>(
      QUERY_KEYS.mailMessage(messageId),
    );
    if (detail) {
      found.set(messageId, detail);
      previousDetails.push([QUERY_KEYS.mailMessage(messageId), detail]);
      queryClient.setQueryData(
        QUERY_KEYS.mailMessage(messageId),
        targetMailboxId
          ? { ...detail, mailboxIds: { [targetMailboxId]: true } }
          : null,
      );
    }
  }
  const previousLists: MailMoveSnapshot["previousLists"] = [];
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: QUERY_KEYS.mailMessagesAll(),
  });
  for (const [key, data] of lists) {
    if (!data) continue;
    for (const message of flattenMailboxMessagesCache(data)) {
      if (idSet.has(message.id) && !found.has(message.id)) {
        found.set(message.id, message);
      }
    }
    const updated =
      targetMailboxId !== null && isTargetListKey(key, targetMailboxId)
        ? patchMailboxMessagesCache(data, idSet, () => ({
            mailboxIds: { [targetMailboxId]: true },
          }))
        : removeMessagesFromMailboxCache(data, idSet);
    if (!updated) continue;
    previousLists.push([key, data]);
    queryClient.setQueryData(key, updated);
  }
  const messages = messageIds.flatMap((id) => {
    const message = found.get(id);
    return message ? [message] : [];
  });
  return {
    messageIds,
    messages,
    restores: collectMailboxRestores(messages),
    previousLists,
    previousDetails,
    targetMailboxId,
  };
}

export function rollbackOptimisticMove(
  queryClient: QueryClient,
  snapshot: MailMoveSnapshot | undefined,
) {
  if (!snapshot) return;
  for (const [key, data] of snapshot.previousLists) {
    queryClient.setQueryData(key, data);
  }
  for (const [key, data] of snapshot.previousDetails)
    queryClient.setQueryData(key, data);
}

export function invalidateMoveLists(
  queryClient: QueryClient,
  snapshot: MailMoveSnapshot | undefined,
) {
  if (!snapshot) {
    return queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.mailMessagesAll(),
    });
  }
  const keys: QueryKey[] = [
    ...snapshot.previousLists.map(([key]) => key),
    ...snapshot.previousDetails.map(([key]) => key),
  ];
  if (snapshot.targetMailboxId) {
    keys.push(QUERY_KEYS.mailMessages(snapshot.targetMailboxId));
  }
  return Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

/** Puts undone messages back into the lists they left and drops them from the target list. */
export function reinsertUndoneMessages(
  queryClient: QueryClient,
  snapshot: MailMoveSnapshot,
) {
  const idSet = new Set(snapshot.messageIds);
  for (const [key, data] of snapshot.previousDetails)
    queryClient.setQueryData(key, data);
  for (const [key, previous] of snapshot.previousLists) {
    const current = queryClient.getQueryData<MailboxMessagesCacheData>(key);
    if (!current) {
      queryClient.setQueryData(key, previous);
      continue;
    }
    const restored = flattenMailboxMessagesCache(previous).filter((message) =>
      idSet.has(message.id),
    );
    const updated = insertMessagesIntoMailboxCache(current, restored);
    if (updated) queryClient.setQueryData(key, updated);
  }
  if (snapshot.targetMailboxId) {
    const targetKey = QUERY_KEYS.mailMessages(snapshot.targetMailboxId);
    const target =
      queryClient.getQueryData<MailboxMessagesCacheData>(targetKey);
    const removedIds = new Set(
      snapshot.restores
        .filter((entry) => !entry.mailboxIds[snapshot.targetMailboxId ?? ""])
        .map((entry) => entry.id),
    );
    const updated = target
      ? removeMessagesFromMailboxCache(target, removedIds)
      : null;
    if (updated) queryClient.setQueryData(targetKey, updated);
  }
}
