import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  withTrustedSender,
  withoutTrustedSender,
  type MailComposeSettings,
  type MailDisplaySettings,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  loadMailComposeSettings,
  loadMailDisplaySettings,
  saveMailComposeSettings,
  saveMailDisplaySettings,
} from "../lib/mail/mail-settings-store";

function useLocalMailSettings<T extends object>(options: {
  queryKey: QueryKey;
  defaults: T;
  load: () => Promise<T>;
  save: (settings: T) => Promise<void>;
}) {
  const { queryKey, defaults, load, save } = options;
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: load, staleTime: Infinity });

  const mutation = useMutation({
    mutationFn: save,
    onMutate: async (next: T) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<T>(queryKey);
      queryClient.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  const { mutate } = mutation;
  const update = useCallback(
    (change: (current: T) => T) => {
      const current = queryClient.getQueryData<T>(queryKey) ?? defaults;
      mutate(change(current));
    },
    [defaults, mutate, queryClient, queryKey],
  );

  return {
    settings: query.data ?? defaults,
    isLoaded: query.isSuccess,
    update,
  };
}

const DISPLAY_SETTINGS_KEY = QUERY_KEYS.mailDisplaySettings();
const COMPOSE_SETTINGS_KEY = QUERY_KEYS.mailComposeSettings();

/** Until SecureStore answers, the defaults apply, which block remote content. */
export function useMailDisplaySettings() {
  const { settings, isLoaded, update } = useLocalMailSettings<MailDisplaySettings>({
    queryKey: DISPLAY_SETTINGS_KEY,
    defaults: DEFAULT_MAIL_DISPLAY_SETTINGS,
    load: loadMailDisplaySettings,
    save: saveMailDisplaySettings,
  });

  const updateSettings = useCallback(
    (patch: Partial<MailDisplaySettings>) =>
      update((current) => ({ ...current, ...patch })),
    [update],
  );
  const addTrustedSender = useCallback(
    (email: string) => update((current) => withTrustedSender(current, email)),
    [update],
  );
  const removeTrustedSender = useCallback(
    (email: string) => update((current) => withoutTrustedSender(current, email)),
    [update],
  );

  return { settings, isLoaded, updateSettings, addTrustedSender, removeTrustedSender };
}

export function useMailComposeSettings() {
  const { settings, isLoaded, update } = useLocalMailSettings<MailComposeSettings>({
    queryKey: COMPOSE_SETTINGS_KEY,
    defaults: DEFAULT_MAIL_COMPOSE_SETTINGS,
    load: loadMailComposeSettings,
    save: saveMailComposeSettings,
  });

  const updateSettings = useCallback(
    (patch: Partial<MailComposeSettings>) =>
      update((current) => ({ ...current, ...patch })),
    [update],
  );

  return { settings, isLoaded, updateSettings };
}
