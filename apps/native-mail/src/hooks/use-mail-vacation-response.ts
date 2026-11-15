import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supportsVacationResponse } from "@workspace/calendar-core";
import {
  saveVacationResponseMutationOptions,
  vacationResponseQueryOptions,
} from "@workspace/calendar-client/mail-vacation-response-query-options";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useMailAccount, useMailRuntime } from "../lib/mail/use-mail";

/** The account's auto-reply, read and saved over JMAP when the mail server offers it. */
export function useMailVacationResponse() {
  const queryClient = useQueryClient();
  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data ?? null;
  const supported = runtime ? supportsVacationResponse(runtime.session) : false;
  const queryKey = QUERY_KEYS.mailVacationResponse();

  const query = useQuery({ ...vacationResponseQueryOptions(queryKey, runtime), enabled: supported });
  const mutation = useMutation(saveVacationResponseMutationOptions(queryKey, runtime, queryClient));

  return {
    loading:
      accountQuery.isPending ||
      (provisioned && runtimeQuery.isPending) ||
      (supported && query.isPending),
    supported,
    response: query.data ?? null,
    loadError: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
    save: mutation.mutateAsync,
    saving: mutation.isPending,
  };
}
