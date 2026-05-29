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
import { getMailAccountStatus } from "./mail-api";
import { buildMailRuntime, type MailRuntime } from "./mail-runtime";
import { sortMessagesByDate } from "./mail-helpers";
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

export function useMailRuntime(enabled: boolean) {
  return useQuery<MailRuntime>({
    queryKey: QUERY_KEYS.mailRuntime(),
    queryFn: buildMailRuntime,
    enabled,
    staleTime: RUNTIME_STALE_MS,
    retry: 1,
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
    placeholderData: (previous) => previous,
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
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.mailMessages(mailboxId),
    });
  }, [queryClient, mailboxId]);

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

  return { markAsRead, toggleFlagged, moveToTrash };
}
