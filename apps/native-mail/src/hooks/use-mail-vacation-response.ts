import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  supportsVacationResponse,
  type VacationResponse,
  type VacationResponseUpdate,
} from "@workspace/calendar-core";
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

  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!runtime) throw new Error("Mail is not ready yet.");
      return runtime.client.getVacationResponse(runtime.session);
    },
    enabled: supported,
  });

  const mutation = useMutation({
    mutationFn: (update: VacationResponseUpdate) => {
      if (!runtime) throw new Error("Mail is not ready yet.");
      return runtime.client.setVacationResponse(runtime.session, update);
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
