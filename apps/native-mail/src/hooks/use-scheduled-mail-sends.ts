import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScheduledMailSend } from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useMailAccount, useMailRuntime } from "../lib/mail/use-mail";

const NO_SENDS: ScheduledMailSend[] = [];

/** Pending scheduled sends, held in memory only (never in the offline snapshot); Drafts and Sent follow through mail sync. */
export function useScheduledMailSends() {
  const queryClient = useQueryClient();
  const accountQuery = useMailAccount();
  const runtime = useMailRuntime(accountQuery.data?.provisioned ?? false).data ?? null;
  const queryKey = QUERY_KEYS.mailScheduledSends();

  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!runtime) throw new Error("Mail is not ready yet.");
      return runtime.client.listScheduledSends(runtime.session);
    },
    enabled: Boolean(runtime) && (runtime?.mailServerPolicy.maxDelayedSendSeconds ?? 0) > 0,
    staleTime: 60_000,
  });

  const cancel = useMutation({
    mutationFn: (send: ScheduledMailSend) => {
      const draftsMailboxId = runtime?.mailboxes.find((mailbox) => mailbox.role === "drafts")?.id;
      if (!runtime || !draftsMailboxId) throw new Error("Mail is not ready yet.");
      return runtime.client.cancelHeldSubmission(runtime.session, {
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mailMessagesAll() }).catch(() => undefined);
    },
  });

  return {
    sends: query.data ?? NO_SENDS,
    loading: Boolean(runtime) && query.isPending && query.fetchStatus !== "idle",
    loadError: query.error,
    cancel: cancel.mutateAsync,
    cancelingId: cancel.isPending ? (cancel.variables?.submissionId ?? null) : null,
  };
}
