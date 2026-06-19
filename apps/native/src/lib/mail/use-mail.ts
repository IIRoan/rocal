/**
 * React Query hooks for the native mail experience.
 */
import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "../../providers/AuthProvider";
import { QUERY_KEYS } from "../query-keys";
import { getMailAccountStatus, getMailConfig } from "./mail-api";
import { bootstrapMailboxForAccount } from "./account-bootstrap";
import {
  buildMailRuntime,
  refreshMailRuntimePolicy,
  type MailRuntime,
} from "./mail-runtime";
import { resolveMailboxMessagesPageSize } from "@workspace/calendar-core";
import { getPrimaryMailboxId, sortMessagesByDate } from "./mail-helpers";
import { MAILBOX_MESSAGES_PAGE_SIZE } from "./mail-pagination";
import {
  flattenMailboxMessagesCache,
  patchMailboxMessagesCache,
  patchSingleMailboxMessageCache,
  removeMessagesFromMailboxCache,
  type MailboxMessagesCacheData,
} from "./mail-message-cache";
import type { JmapEmailMessage, LabelDef } from "./types";

const RUNTIME_STALE_MS = 5 * 60_000;

export function useMailAccount() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QUERY_KEYS.mailAccount(),
    queryFn: getMailAccountStatus,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
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
  return useQuery<MailRuntime>({
    queryKey: QUERY_KEYS.mailRuntime(),
    queryFn: buildMailRuntime,
    enabled,
    staleTime: RUNTIME_STALE_MS,
    retry: 1,
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
  const pageSize = runtime?.mailServerPolicy
    ? resolveMailboxMessagesPageSize(
        runtime.mailServerPolicy,
        MAILBOX_MESSAGES_PAGE_SIZE,
      )
    : MAILBOX_MESSAGES_PAGE_SIZE;

  return useInfiniteQuery({
    queryKey: QUERY_KEYS.mailMessages(mailboxId),
    enabled: Boolean(runtime && mailboxId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { messages, total } = await runtime!.client.getMailboxMessages(
        runtime!.session,
        mailboxId!,
        { limit: pageSize, position: pageParam },
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

/** Locates a single message in any cached mailbox list. */
export function useCachedMessage(
  messageId: string,
): JmapEmailMessage | undefined {
  const queryClient = useQueryClient();
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: ["mail", "messages"],
  });
  for (const [, data] of lists) {
    const found = flattenMailboxMessagesCache(data).find(
      (message) => message.id === messageId,
    );
    if (found) return found;
  }
  return undefined;
}

/** Find a cached message by id across all mailbox lists. */
function findCachedMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  messageId: string,
): JmapEmailMessage | undefined {
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: ["mail", "messages"],
  });
  for (const [, data] of lists) {
    const found = flattenMailboxMessagesCache(data).find(
      (message) => message.id === messageId,
    );
    if (found) return found;
  }
  return undefined;
}

/** Patch multiple messages inside all cached mailbox lists. */
function patchManyMessagesInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  messageIds: string[],
  patch: (msg: JmapEmailMessage) => Partial<JmapEmailMessage>,
) {
  const idSet = new Set(messageIds);
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: ["mail", "messages"],
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

/** Patch a single message inside all cached mailbox lists. */
function patchMessageInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  messageId: string,
  patch: (msg: JmapEmailMessage) => Partial<JmapEmailMessage>,
) {
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: ["mail", "messages"],
  });
  for (const [key, data] of lists) {
    if (!data) continue;
    const updated = patchSingleMailboxMessageCache(data, messageId, patch);
    if (updated) {
      queryClient.setQueryData(key, updated);
    }
  }
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
    queryClient.invalidateQueries({ queryKey: ["mail", "messages"] });
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
    mutationFn: (messageId: string) => {
      const trashId =
        runtime!.mailboxes.find((m) => m.role === "trash")?.id ?? null;
      return runtime!.client.moveToTrash(
        runtime!.session,
        messageId,
        trashId,
      );
    },
    onSuccess: invalidateMessages,
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) =>
      runtime!.client.deleteMessage(runtime!.session, messageId),
    onSuccess: invalidateMessages,
  });

  const moveToMailbox = useMutation({
    mutationFn: (input: { messageId: string; targetMailboxId: string }) =>
      runtime!.client.moveToMailbox(
        runtime!.session,
        input.messageId,
        input.targetMailboxId,
      ),
    onSuccess: invalidateMessages,
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

  const bulkMoveToTrash = useMutation({
    mutationFn: (messageIds: string[]) => {
      const trashId =
        runtime!.mailboxes.find((m) => m.role === "trash")?.id ?? null;
      const isInTrash = mailboxId === trashId;
      return runtime!.client.bulkMoveToTrash(
        runtime!.session,
        messageIds,
        isInTrash ? null : trashId,
      );
    },
    onSuccess: invalidateMessages,
  });

  const bulkMoveToMailbox = useMutation({
    mutationFn: (input: { messageIds: string[]; targetMailboxId: string }) =>
      runtime!.client.bulkMoveToMailbox(
        runtime!.session,
        input.messageIds,
        input.targetMailboxId,
      ),
    onSuccess: invalidateMessages,
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
}

/**
 * Resolves the identity + drafts/sent mailboxes needed to send mail, or `null`
 * when the runtime is not ready or has no usable sending identity.
 */
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
      });
    },
    onSuccess: (_data, variables) => {
      const draftId = variables.previousDraftId?.trim();
      if (draftId) {
        const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
          queryKey: ["mail", "messages"],
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
      queryClient.invalidateQueries({ queryKey: ["mail", "messages"] });
    },
  });
}
