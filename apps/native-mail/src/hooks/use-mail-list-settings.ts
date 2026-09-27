import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_MAIL_LIST_SETTINGS,
  type MailListSettings,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  loadMailListSettings,
  saveMailListSettings,
} from "../lib/mail/mail-list-settings-store";

const LIST_SETTINGS_KEY = QUERY_KEYS.mailListSettings();

export function useMailListSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: LIST_SETTINGS_KEY,
    queryFn: loadMailListSettings,
    staleTime: Infinity,
  });

  const { mutate } = useMutation({
    mutationFn: saveMailListSettings,
    onMutate: async (next: MailListSettings) => {
      await queryClient.cancelQueries({ queryKey: LIST_SETTINGS_KEY });
      const previous =
        queryClient.getQueryData<MailListSettings>(LIST_SETTINGS_KEY);
      queryClient.setQueryData(LIST_SETTINGS_KEY, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(LIST_SETTINGS_KEY, context.previous);
      }
    },
  });

  const updateSettings = useCallback(
    (patch: Partial<MailListSettings>) => {
      const current =
        queryClient.getQueryData<MailListSettings>(LIST_SETTINGS_KEY) ??
        DEFAULT_MAIL_LIST_SETTINGS;
      mutate({ ...current, ...patch });
    },
    [mutate, queryClient],
  );

  return {
    settings: query.data ?? DEFAULT_MAIL_LIST_SETTINGS,
    isLoaded: query.isSuccess,
    updateSettings,
  };
}
