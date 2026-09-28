import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { getMailAccountStatus, getMailConfig } from "./mail-api";
import { bootstrapMailboxForAccount } from "./account-bootstrap";
import {
  buildMailRuntime,
  refreshMailRuntimePolicy,
  type MailRuntime,
} from "./mail-runtime";
import {
  resolveEncryptionInternalDomain,
  resolveMailboxMessagesPageSize,
  shouldEncryptOutgoingMail,
} from "@workspace/calendar-core";
import { getPrimaryMailboxId, sortMessagesByDate } from "./mail-helpers";
import {
  MAILBOX_MESSAGES_PAGE_SIZE,
  mailboxPageMaxBodyValueBytes,
} from "./mail-pagination";
import {
  flattenMailboxMessagesCache,
  patchMailboxMessagesCache,
  patchSingleMailboxMessageCache,
  removeMessagesFromMailboxCache,
  type MailboxMessagesCacheData,
  type MailboxMessagesPage,
} from "./mail-message-cache";
import {
  beginOptimisticMove,
  invalidateMoveLists,
  reinsertUndoneMessages,
  rollbackOptimisticMove,
  type MailMoveSnapshot,
} from "./mail-move-cache";
import { hasTruncatedBody } from "./mail-offline-snapshot";
import type { JmapEmailMessage } from "./types";

export type { MailMoveSnapshot } from "./mail-move-cache";

const RUNTIME_STALE_MS = 5 * 60_000;

export function useMailAccount() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: QUERY_KEYS.mailAccount(),
    queryFn: getMailAccountStatus,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
    placeholderData: () =>
      queryClient.getQueryData<
        Awaited<ReturnType<typeof getMailAccountStatus>>
      >(QUERY_KEYS.mailAccount()),
  });
}

export function useMailConfig() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QUERY_KEYS.mailConfig(),
    queryFn: getMailConfig,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useMailRuntime(enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery<MailRuntime>({
    queryKey: QUERY_KEYS.mailRuntime(),
    queryFn: buildMailRuntime,
    enabled,
    staleTime: RUNTIME_STALE_MS,
    retry: 1,
    placeholderData: () =>
      queryClient.getQueryData<MailRuntime>(QUERY_KEYS.mailRuntime()),
  });
}

export function useProvisionMailbox() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id || !user.email) {
        throw new Error("Sign in before creating a mailbox.");
      }

      return bootstrapMailboxForAccount({
        userId: user.id,
        email: user.email,
        displayName: user.name ?? null,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.mailAccount(),
        }),
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.mailRuntime(),
        }),
      ]);
    },
  });
}

export function useMailboxMessages(
  runtime: MailRuntime | undefined,
  mailboxId: string | null,
) {
  const queryClient = useQueryClient();
  const pageSize = runtime?.mailServerPolicy
    ? resolveMailboxMessagesPageSize(
      runtime.mailServerPolicy,
      MAILBOX_MESSAGES_PAGE_SIZE,
    )
    : MAILBOX_MESSAGES_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: QUERY_KEYS.mailMessages(mailboxId),
    enabled: Boolean(runtime && mailboxId),
    placeholderData: () => {
      const cached = queryClient.getQueryData<MailboxMessagesCacheData>(
        QUERY_KEYS.mailMessages(mailboxId),
      );
      if (!cached || !("pages" in cached)) {
        return undefined;
      }
      return cached as InfiniteData<
        MailboxMessagesPage,
        number
      >;
    },
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { messages, total } = await runtime!.client.getMailboxMessages(
        runtime!.session,
        mailboxId!,
        {
          limit: pageSize,
          position: pageParam,
          maxBodyValueBytes: mailboxPageMaxBodyValueBytes(pageParam),
        },
      );
      return {
        messages: sortMessagesByDate(messages),
        total,
        position: pageParam,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextPosition = lastPage.position + lastPage.messages.length;
      if (lastPage.total > 0) {
        return nextPosition < lastPage.total ? nextPosition : undefined;
      }
      return lastPage.messages.length >= pageSize ? nextPosition : undefined;
    },
  });
}

/** Server-side field search; `revision` stands in for the query in the cache key so no search text lands in it. */
export function useMailboxFieldSearch(
  runtime: MailRuntime | undefined,
  mailboxId: string | null,
  filter: Record<string, unknown> | null,
  revision: number,
) {
  const pageSize = 40;
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: QUERY_KEYS.mailSearchMessages(mailboxId, revision),
    enabled: Boolean(runtime && mailboxId && filter),
    staleTime: 30_000,
    queryFn: async ({ pageParam }) => {
      // Non-null: the query is only enabled once runtime, mailbox, and filter exist.
      const { messages, total } =
        await runtime!.client.searchMailboxMessagesWithFilter(
          runtime!.session,
          mailboxId!,
          filter!,
          pageSize,
          pageParam,
        );
      return { messages: sortMessagesByDate(messages), total, position: pageParam };
    },
    getNextPageParam: (lastPage) => {
      const next = lastPage.position + lastPage.messages.length;
      if (!lastPage.messages.length) return undefined;
      return lastPage.total > 0
        ? (next < lastPage.total ? next : undefined)
        : (lastPage.messages.length >= pageSize ? next : undefined);
    },
  });
}

export function useCachedMessage(
  messageId: string,
): JmapEmailMessage | undefined {
  const queryClient = useQueryClient();
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: QUERY_KEYS.mailMessagesAll(),
  });
  for (const [, data] of lists) {
    const found = flattenMailboxMessagesCache(data).find(
      (message) => message.id === messageId,
    );
    if (found) return found;
  }
  return undefined;
}

/** Loads one message, seeded from any cached mailbox list that already holds it. */
export function useMailMessage(
  runtime: MailRuntime | undefined,
  messageId: string,
) {
  const listCopy = useCachedMessage(messageId);
  // Offline-snapshot copies may carry capped bodies; the reader always gets the full message.
  const cached = listCopy && !hasTruncatedBody(listCopy) ? listCopy : undefined;
  return useQuery<JmapEmailMessage | null>({
    queryKey: QUERY_KEYS.mailMessage(messageId),
    enabled: Boolean(messageId) && (Boolean(cached) || Boolean(runtime)),
    initialData: cached,
    queryFn: async () => {
      if (cached) return cached;
      // Non-null: the query is only enabled once runtime (or a cached copy) exists.
      const list = await runtime!.client.getMessagesByIds(runtime!.session, [
        messageId,
      ]);
      return list[0] ?? null;
    },
  });
}

function patchManyMessagesInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  messageIds: string[],
  patch: (msg: JmapEmailMessage) => Partial<JmapEmailMessage>,
) {
  const idSet = new Set(messageIds);
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: QUERY_KEYS.mailMessagesAll(),
  });
  for (const [key, data] of lists) {
    if (!data) continue;
    const updated = patchMailboxMessagesCache(data, idSet, patch);
    if (updated) {
      queryClient.setQueryData(key, updated);
    }
  }
  for (const messageId of messageIds) {
    patchSingleMessageInCache(queryClient, messageId, patch);
  }
}

function patchMessageInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  messageId: string,
  patch: (msg: JmapEmailMessage) => Partial<JmapEmailMessage>,
) {
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: QUERY_KEYS.mailMessagesAll(),
  });
  for (const [key, data] of lists) {
    if (!data) continue;
    const updated = patchSingleMailboxMessageCache(data, messageId, patch);
    if (updated) {
      queryClient.setQueryData(key, updated);
    }
  }
}

/** Reverts a finished move by restoring each message's original mailboxes; callbacks run even if the caller unmounted. */
export function useUndoMailMove(
  runtime: MailRuntime | undefined,
  callbacks: {
    onSuccess?: (snapshot: MailMoveSnapshot) => void;
    onError?: (error: Error) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    onSuccess: (_data, snapshot) => callbacks.onSuccess?.(snapshot),
    onError: (error) => callbacks.onError?.(error),
    mutationFn: async (snapshot: MailMoveSnapshot) => {
      if (!runtime) throw new Error("Your mailbox is not connected.");
      await runtime.client.restoreMessageMailboxes(
        runtime.session,
        snapshot.restores,
      );
    },
    onMutate: (snapshot) => reinsertUndoneMessages(queryClient, snapshot),
    onSettled: (_data, _error, snapshot) =>
      invalidateMoveLists(queryClient, snapshot),
  });
}

function resolveTrashMailboxId(runtime: MailRuntime | undefined) {
  return runtime?.mailboxes.find((m) => m.role === "trash")?.id ?? null;
}

/** Message ids the user marked unread while viewing — skip mark-as-read until they leave. */
const suppressMarkAsReadIds = new Set<string>();

export function suppressMarkAsRead(messageId: string) {
  suppressMarkAsReadIds.add(messageId);
}

export function releaseMarkAsReadSuppression(messageId: string) {
  suppressMarkAsReadIds.delete(messageId);
}

/** Patch the single message detail query so the detail screen updates immediately. */
function patchSingleMessageInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  messageId: string,
  patch: (msg: JmapEmailMessage) => Partial<JmapEmailMessage>,
) {
  const key = QUERY_KEYS.mailMessage(messageId);
  const data = queryClient.getQueryData<JmapEmailMessage>(key);
  if (data) {
    queryClient.setQueryData(key, { ...data, ...patch(data) });
  }
}

export function useMailMutations(
  runtime: MailRuntime | undefined,
  mailboxId: string | null,
) {
  const queryClient = useQueryClient();

  const invalidateMessages = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mailMessagesAll() });
  }, [queryClient]);

  const markAsRead = useMutation({
    mutationFn: (messageId: string) => {
      if (suppressMarkAsReadIds.has(messageId)) {
        return Promise.resolve();
      }
      return runtime!.client.markAsRead(runtime!.session, messageId);
    },
    onMutate: (messageId) => {
      if (suppressMarkAsReadIds.has(messageId)) return;
      patchMessageInCache(queryClient, messageId, (msg) => ({
        keywords: { ...msg.keywords, $seen: true },
      }));
      patchSingleMessageInCache(queryClient, messageId, (msg) => ({
        keywords: { ...msg.keywords, $seen: true },
      }));
    },
    onError: () => invalidateMessages(),
  });

  const toggleFlagged = useMutation({
    mutationFn: (input: { messageId: string; flagged: boolean }) =>
      runtime!.client.toggleFlagged(
        runtime!.session,
        input.messageId,
        input.flagged,
      ),
    onMutate: (input) => {
      patchMessageInCache(queryClient, input.messageId, (msg) => ({
        keywords: { ...msg.keywords, $flagged: input.flagged },
      }));
      patchSingleMessageInCache(queryClient, input.messageId, (msg) => ({
        keywords: { ...msg.keywords, $flagged: input.flagged },
      }));
    },
    onError: () => {
      invalidateMessages();
    },
  });

  const markAsUnread = useMutation({
    mutationFn: (messageId: string) =>
      runtime!.client.markAsUnread(runtime!.session, messageId),
    onMutate: (messageId) => {
      patchMessageInCache(queryClient, messageId, (msg) => {
        const keywords = { ...msg.keywords };
        delete keywords.$seen;
        return { keywords };
      });
      patchSingleMessageInCache(queryClient, messageId, (msg) => {
        const keywords = { ...msg.keywords };
        delete keywords.$seen;
        return { keywords };
      });
    },
    onError: () => invalidateMessages(),
  });

  const moveToTrash = useMutation({
    mutationFn: (messageId: string) =>
      runtime!.client.moveToTrash(
        runtime!.session,
        messageId,
        resolveTrashMailboxId(runtime),
      ),
    onMutate: (messageId) =>
      beginOptimisticMove(
        queryClient,
        [messageId],
        resolveTrashMailboxId(runtime),
      ),
    onError: (_error, _messageId, snapshot) =>
      rollbackOptimisticMove(queryClient, snapshot),
    onSettled: (_data, _error, _messageId, snapshot) =>
      invalidateMoveLists(queryClient, snapshot),
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) =>
      runtime!.client.deleteMessage(runtime!.session, messageId),
    onMutate: (messageId) =>
      beginOptimisticMove(queryClient, [messageId], null),
    onError: (_error, _messageId, snapshot) =>
      rollbackOptimisticMove(queryClient, snapshot),
    onSettled: (_data, _error, _messageId, snapshot) =>
      invalidateMoveLists(queryClient, snapshot),
  });

  const moveToMailbox = useMutation({
    mutationFn: (input: { messageId: string; targetMailboxId: string }) =>
      runtime!.client.moveToMailbox(
        runtime!.session,
        input.messageId,
        input.targetMailboxId,
      ),
    onMutate: (input) =>
      beginOptimisticMove(
        queryClient,
        [input.messageId],
        input.targetMailboxId,
      ),
    onError: (_error, _input, snapshot) =>
      rollbackOptimisticMove(queryClient, snapshot),
    onSettled: (_data, _error, _input, snapshot) =>
      invalidateMoveLists(queryClient, snapshot),
  });

  const setMessageLabel = useMutation({
    mutationFn: (input: { messageId: string; labelId: string; assigned: boolean }) =>
      runtime!.client.setMessageLabel(
        runtime!.session,
        input.messageId,
        input.labelId,
        input.assigned,
      ),
    onMutate: (input) => {
      const keywordKey = `label:${input.labelId}` as const;
      patchMessageInCache(queryClient, input.messageId, (msg) => {
        const keywords = { ...msg.keywords };
        if (input.assigned) {
          keywords[keywordKey] = true;
        } else {
          delete keywords[keywordKey];
        }
        return { keywords };
      });
      patchSingleMessageInCache(queryClient, input.messageId, (msg) => {
        const keywords = { ...msg.keywords };
        if (input.assigned) {
          keywords[keywordKey] = true;
        } else {
          delete keywords[keywordKey];
        }
        return { keywords };
      });
    },
    onError: () => invalidateMessages(),
  });

  const bulkMarkAsRead = useMutation({
    mutationFn: (messageIds: string[]) =>
      runtime!.client.bulkMarkAsRead(runtime!.session, messageIds),
    onMutate: (messageIds) => {
      patchManyMessagesInCache(queryClient, messageIds, (msg) => ({
        keywords: { ...msg.keywords, $seen: true },
      }));
    },
    onError: () => invalidateMessages(),
  });

  const bulkMarkAsUnread = useMutation({
    mutationFn: (messageIds: string[]) =>
      runtime!.client.bulkMarkAsUnread(runtime!.session, messageIds),
    onMutate: (messageIds) => {
      patchManyMessagesInCache(queryClient, messageIds, (msg) => {
        const keywords = { ...msg.keywords };
        delete keywords.$seen;
        return { keywords };
      });
    },
    onError: () => invalidateMessages(),
  });

  const resolveBulkTrashTarget = () => {
    const trashId = resolveTrashMailboxId(runtime);
    return mailboxId === trashId ? null : trashId;
  };

  const bulkMoveToTrash = useMutation({
    mutationFn: (messageIds: string[]) =>
      runtime!.client.bulkMoveToTrash(
        runtime!.session,
        messageIds,
        resolveBulkTrashTarget(),
      ),
    onMutate: (messageIds) =>
      beginOptimisticMove(queryClient, messageIds, resolveBulkTrashTarget()),
    onError: (_error, _messageIds, snapshot) =>
      rollbackOptimisticMove(queryClient, snapshot),
    // Resolve only after the refetch so swiped rows are gone before they reset.
    onSettled: (_data, _error, _messageIds, snapshot) =>
      invalidateMoveLists(queryClient, snapshot),
  });

  const bulkMoveToMailbox = useMutation({
    mutationFn: (input: { messageIds: string[]; targetMailboxId: string }) =>
      runtime!.client.bulkMoveToMailbox(
        runtime!.session,
        input.messageIds,
        input.targetMailboxId,
      ),
    onMutate: (input) =>
      beginOptimisticMove(
        queryClient,
        input.messageIds,
        input.targetMailboxId,
      ),
    onError: (_error, _input, snapshot) =>
      rollbackOptimisticMove(queryClient, snapshot),
    onSettled: (_data, _error, _input, snapshot) =>
      invalidateMoveLists(queryClient, snapshot),
  });

  const bulkDestroyMessages = useMutation({
    mutationFn: (messageIds: string[]) =>
      runtime!.client.bulkDestroyMessages(runtime!.session, messageIds),
    onMutate: (messageIds) =>
      beginOptimisticMove(queryClient, messageIds, null),
    onError: (_error, _messageIds, snapshot) =>
      rollbackOptimisticMove(queryClient, snapshot),
    onSettled: (_data, _error, _messageIds, snapshot) =>
      invalidateMoveLists(queryClient, snapshot),
  });

  const emptyMailbox = useMutation({
    mutationFn: (targetMailboxId: string) =>
      runtime!.client.emptyMailbox(runtime!.session, targetMailboxId),
    onSettled: (_count, _error, targetMailboxId) =>
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.mailMessages(targetMailboxId),
      }),
  });

  return {
    markAsRead,
    markAsUnread,
    toggleFlagged,
    moveToTrash,
    deleteMessage,
    moveToMailbox,
    setMessageLabel,
    bulkMarkAsRead,
    bulkMarkAsUnread,
    bulkMoveToTrash,
    bulkMoveToMailbox,
    bulkDestroyMessages,
    emptyMailbox,
  };
}

export interface ComposeMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  identityId?: string | null;
  previousDraftId?: string | null;
  attachments?: import("./jmap-client").JmapAttachmentInput[];
}

/** Identity plus drafts/sent mailboxes for sending, or `null` when the runtime is not ready or has no usable identity. */
export function resolveComposeContext(
  runtime: MailRuntime | undefined,
  identityId?: string | null,
): {
  identityId: string;
  fromEmail: string;
  fromName: string | null;
  draftsMailboxId: string;
  sentMailboxId: string | null;
} | null {
  if (!runtime) return null;
  const identity =
    runtime.identities.find((entry) => entry.id === identityId) ??
    runtime.identities[0];
  if (!identity?.email) return null;

  const draftsMailboxId =
    getPrimaryMailboxId(runtime.mailboxes, "drafts") ??
    runtime.mailboxes[0]?.id ??
    null;
  if (!draftsMailboxId) return null;

  return {
    identityId: identity.id,
    fromEmail: identity.email,
    fromName: identity.name ?? null,
    draftsMailboxId,
    sentMailboxId: getPrimaryMailboxId(runtime.mailboxes, "sent"),
  };
}

export function useSendMessage(runtime: MailRuntime | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ComposeMessageInput) => {
      if (!runtime) {
        throw new Error("Your mailbox is not ready to send messages yet.");
      }
      const refreshedRuntime = await refreshMailRuntimePolicy(runtime);
      queryClient.setQueryData(QUERY_KEYS.mailRuntime(), refreshedRuntime);

      const context = resolveComposeContext(refreshedRuntime, input.identityId);
      if (!context) {
        throw new Error("Your mailbox is not ready to send messages yet.");
      }

      const allRecipients = [
        ...input.to,
        ...(input.cc ?? []),
        ...(input.bcc ?? []),
      ];
      const internalDomain = resolveEncryptionInternalDomain(
        refreshedRuntime.config.defaultDomain,
      );
      if (!shouldEncryptOutgoingMail(allRecipients, internalDomain)) {
        await refreshedRuntime.client.ensureEncryptOnAppendDisabled(
          refreshedRuntime.session,
        );
      }

      return refreshedRuntime.client.sendMessage(refreshedRuntime.session, {
        draftsMailboxId: context.draftsMailboxId,
        sentMailboxId: context.sentMailboxId,
        fromEmail: context.fromEmail,
        fromName: context.fromName,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        textBody: input.textBody,
        htmlBody: input.htmlBody,
        identityId: context.identityId,
        previousDraftId: input.previousDraftId ?? undefined,
        attachments: input.attachments,
      });
    },
    onSuccess: (_data, variables) => {
      const draftId = variables.previousDraftId?.trim();
      if (draftId) {
        const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
          queryKey: QUERY_KEYS.mailMessagesAll(),
        });
        for (const [key, data] of lists) {
          if (!data) continue;
          const updated = removeMessagesFromMailboxCache(
            data,
            new Set([draftId]),
          );
          if (updated) {
            queryClient.setQueryData(key, updated);
          }
        }
        queryClient.removeQueries({ queryKey: QUERY_KEYS.mailMessage(draftId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mailMessagesAll() });
    },
  });
}
