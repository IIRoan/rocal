/**
 * React Query hooks for the native mail experience.
 */
import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "../../providers/AuthProvider";
import { QUERY_KEYS } from "../query-keys";
import { getMailAccountStatus, getMailConfig } from "./mail-api";
import { bootstrapMailboxForAccount } from "./account-bootstrap";
import { buildMailRuntime, type MailRuntime } from "./mail-runtime";
import { getPrimaryMailboxId, sortMessagesByDate } from "./mail-helpers";
import type { JmapEmailMessage } from "./types";

const RUNTIME_STALE_MS = 5 * 60_000;
const MESSAGES_LIMIT = 30;

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
  return useQuery({
    queryKey: QUERY_KEYS.mailMessages(mailboxId),
    enabled: Boolean(runtime && mailboxId),
    queryFn: async () => {
      const { messages, total } = await runtime!.client.getMailboxMessages(
        runtime!.session,
        mailboxId!,
        { limit: MESSAGES_LIMIT },
      );
      return { messages: sortMessagesByDate(messages), total };
    },
  });
}

/** Locates a single message in any cached mailbox list. */
export function useCachedMessage(
  messageId: string,
): JmapEmailMessage | undefined {
  const queryClient = useQueryClient();
  const lists = queryClient.getQueriesData<{
    messages: JmapEmailMessage[];
    total: number;
  }>({ queryKey: ["mail", "messages"] });
  for (const [, data] of lists) {
    const found = data?.messages.find((message) => message.id === messageId);
    if (found) return found;
  }
  return undefined;
}

export function useMailMutations(
  runtime: MailRuntime | undefined,
  mailboxId: string | null,
) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["mail"] });
  }, [queryClient]);

  const markAsRead = useMutation({
    mutationFn: (messageId: string) =>
      runtime!.client.markAsRead(runtime!.session, messageId),
    onSuccess: invalidate,
  });

  const toggleFlagged = useMutation({
    mutationFn: (input: { messageId: string; flagged: boolean }) =>
      runtime!.client.toggleFlagged(
        runtime!.session,
        input.messageId,
        input.flagged,
      ),
    onSuccess: invalidate,
  });

  const markAsUnread = useMutation({
    mutationFn: (messageId: string) =>
      runtime!.client.markAsUnread(runtime!.session, messageId),
    onSuccess: invalidate,
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
    onSuccess: invalidate,
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) =>
      runtime!.client.deleteMessage(runtime!.session, messageId),
    onSuccess: invalidate,
  });

  const moveToMailbox = useMutation({
    mutationFn: (input: { messageId: string; targetMailboxId: string }) =>
      runtime!.client.moveToMailbox(
        runtime!.session,
        input.messageId,
        input.targetMailboxId,
      ),
    onSuccess: invalidate,
  });

  return {
    markAsRead,
    markAsUnread,
    toggleFlagged,
    moveToTrash,
    deleteMessage,
    moveToMailbox,
  };
}

export interface ComposeMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
}

/**
 * Resolves the identity + drafts/sent mailboxes needed to send mail, or `null`
 * when the runtime is not ready or has no usable sending identity.
 */
export function resolveComposeContext(runtime: MailRuntime | undefined): {
  identityId: string;
  fromEmail: string;
  draftsMailboxId: string;
  sentMailboxId: string | null;
} | null {
  if (!runtime) return null;
  const identity = runtime.identities[0];
  if (!identity?.email) return null;

  const draftsMailboxId =
    getPrimaryMailboxId(runtime.mailboxes, "drafts") ??
    runtime.mailboxes[0]?.id ??
    null;
  if (!draftsMailboxId) return null;

  return {
    identityId: identity.id,
    fromEmail: identity.email,
    draftsMailboxId,
    sentMailboxId: getPrimaryMailboxId(runtime.mailboxes, "sent"),
  };
}

export function useSendMessage(runtime: MailRuntime | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ComposeMessageInput) => {
      const context = resolveComposeContext(runtime);
      if (!runtime || !context) {
        throw new Error("Your mailbox is not ready to send messages yet.");
      }
      return runtime.client.sendMessage(runtime.session, {
        ...context,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        textBody: input.textBody,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mail", "messages"] });
    },
  });
}
