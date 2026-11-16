"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveMailServerPolicy, type ScheduledMailSend } from "@workspace/calendar-core";
import type { MailConnection } from "@/hooks/use-mail-vacation-response";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";

const NO_SENDS: ScheduledMailSend[] = [];

/** Pending scheduled sends, kept in memory only; Drafts and Sent follow through the mailbox sync. */
export function useScheduledMailSends(
  connection: MailConnection | null,
  userId: string | null,
  draftsMailboxId: string | null,
) {
  const queryClient = useQueryClient();
  const queryKey = mailQueryKeys.scheduledSends(userId);
  const canHoldSends = connection
    ? resolveMailServerPolicy({ session: connection.session }).maxDelayedSendSeconds > 0
    : false;

  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!connection) throw new Error("Mail is not ready yet.");
      return connection.client.listScheduledSends(connection.session);
    },
    enabled: Boolean(connection && userId) && canHoldSends,
    staleTime: 60_000,
  });

  const cancel = useMutation({
    mutationFn: (send: ScheduledMailSend) => {
      if (!connection || !draftsMailboxId) throw new Error("Mail is not ready yet.");
      return connection.client.cancelHeldSubmission(connection.session, {
        submissionId: send.submissionId,
        copyEmailId: send.emailId,
        draftsMailboxId,
      });
    },
    onMutate: async (send) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ScheduledMailSend[]>(queryKey);
      queryClient.setQueryData<ScheduledMailSend[]>(queryKey, (current) =>
        (current ?? []).filter((entry) => entry.submissionId !== send.submissionId),
      );
      return { previous };
    },
    onError: (_error, _send, context) => queryClient.setQueryData(queryKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const moveToDrafts = useMutation({
    mutationFn: (send: ScheduledMailSend) => {
      if (!connection || !draftsMailboxId) throw new Error("Mail is not ready yet.");
      return connection.client.moveCanceledSendToDrafts(connection.session, { copyEmailId: send.emailId, draftsMailboxId });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    sends: query.data ?? NO_SENDS,
    loading: Boolean(connection) && query.isPending && query.fetchStatus !== "idle",
    loadError: query.error,
    cancel: cancel.mutateAsync,
    moveToDrafts: moveToDrafts.mutateAsync,
    cancelingId: cancel.isPending ? (cancel.variables?.submissionId ?? null) : null,
  };
}
