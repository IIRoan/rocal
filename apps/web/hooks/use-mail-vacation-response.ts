"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  supportsVacationResponse,
  type VacationResponse,
  type VacationResponseUpdate,
} from "@workspace/calendar-core";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";
import type { JmapSession } from "@/lib/mail/types";

export type MailConnection = { client: StalwartJmapClient; session: JmapSession };

/** The account's auto-reply, read and saved over JMAP when the mail server offers it. */
export function useMailVacationResponse(
  connection: MailConnection | null,
  userId: string | null,
) {
  const queryClient = useQueryClient();
  const supported = connection ? supportsVacationResponse(connection.session) : false;
  const queryKey = mailQueryKeys.vacationResponse(userId);

  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!connection) throw new Error("Mail is not ready yet.");
      return connection.client.getVacationResponse(connection.session);
    },
    enabled: supported && Boolean(userId),
  });

  const mutation = useMutation({
    mutationFn: (update: VacationResponseUpdate) => {
      if (!connection) throw new Error("Mail is not ready yet.");
      return connection.client.setVacationResponse(connection.session, update);
    },
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VacationResponse | null>(queryKey);
      const optimistic: VacationResponse = { id: "singleton", ...update };
      queryClient.setQueryData<VacationResponse | null>(queryKey, optimistic);
      return { previous };
    },
    onError: (_error, _update, context) =>
      queryClient.setQueryData<VacationResponse | null>(queryKey, context?.previous ?? null),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    loading: !connection || (supported && query.isPending),
    supported,
    response: query.data ?? null,
    loadError: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
    save: mutation.mutateAsync,
    saving: mutation.isPending,
  };
}
