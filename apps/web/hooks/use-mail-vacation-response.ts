"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supportsVacationResponse } from "@workspace/calendar-core";
import {
  saveVacationResponseMutationOptions,
  vacationResponseQueryOptions,
} from "@workspace/calendar-client/mail-vacation-response-query-options";
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
    ...vacationResponseQueryOptions(queryKey, connection),
    enabled: supported && Boolean(userId),
  });
  const mutation = useMutation(saveVacationResponseMutationOptions(queryKey, connection, queryClient));

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
