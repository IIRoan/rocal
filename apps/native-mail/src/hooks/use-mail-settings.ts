import { useCallback, useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  DEFAULT_MAIL_SYNCED_SETTINGS,
  withTrustedSender,
  withoutTrustedSender,
  type MailComposeSettings,
  type MailDisplaySettings,
  type MailListSettings,
  type MailSyncedSettings,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { useE2ee } from "@workspace/native-core/providers/E2eeProvider";
import {
  loadMailSyncedSettingsCrypto,
  readLocalMailSyncedSettings,
  saveMailSyncedSettingsCrypto,
  writeLocalMailSyncedSettings,
} from "../lib/mail/e2ee-mail-settings";

const SYNCED_KEY = QUERY_KEYS.mailSyncedSettings();
const SAVE_SCOPE = { id: "mail-synced-settings" };

function useMailSyncedSettings() {
  const { user } = useAuth();
  const { isEnabled, isReady, runWithAccountKey } = useE2ee();
  const queryClient = useQueryClient();
  const canSync = Boolean(user) && isEnabled && isReady;

  const query = useQuery({
    queryKey: SYNCED_KEY,
    queryFn: async (): Promise<MailSyncedSettings> => {
      if (canSync) {
        const loaded = await runWithAccountKey((accountKey, e2ee) =>
          loadMailSyncedSettingsCrypto(accountKey, e2ee),
        );
        if (loaded) return loaded;
      }
      return readLocalMailSyncedSettings();
    },
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!canSync) return;
    void queryClient.invalidateQueries({ queryKey: SYNCED_KEY });
  }, [canSync, queryClient]);

  const mutation = useMutation({
    // Each save uploads the whole blob, so saves run one at a time to keep the last edit last.
    scope: SAVE_SCOPE,
    mutationFn: async (next: MailSyncedSettings) => {
      if (canSync) {
        const saved = await runWithAccountKey((accountKey, e2ee) =>
          saveMailSyncedSettingsCrypto(accountKey, e2ee, next),
        );
        if (saved) return saved;
      }
      return writeLocalMailSyncedSettings(next);
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: SYNCED_KEY });
      const previous = queryClient.getQueryData<MailSyncedSettings>(SYNCED_KEY);
      queryClient.setQueryData(SYNCED_KEY, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(SYNCED_KEY, context.previous);
      }
    },
  });

  const { mutate } = mutation;
  const update = useCallback(
    (change: (current: MailSyncedSettings) => MailSyncedSettings) => {
      const current =
        queryClient.getQueryData<MailSyncedSettings>(SYNCED_KEY) ??
        DEFAULT_MAIL_SYNCED_SETTINGS;
      mutate(change(current));
    },
    [mutate, queryClient],
  );

  return {
    settings: query.data ?? DEFAULT_MAIL_SYNCED_SETTINGS,
    isLoaded: query.isSuccess,
    update,
  };
}

/** Until SecureStore / server answers, defaults apply (remote content blocked). */
export function useMailDisplaySettings() {
  const { settings, isLoaded, update } = useMailSyncedSettings();

  const updateSettings = useCallback(
    (patch: Partial<MailDisplaySettings>) =>
      update((current) => ({
        ...current,
        display: { ...current.display, ...patch },
      })),
    [update],
  );
  const addTrustedSender = useCallback(
    (email: string) =>
      update((current) => ({
        ...current,
        display: withTrustedSender(current.display, email),
      })),
    [update],
  );
  const removeTrustedSender = useCallback(
    (email: string) =>
      update((current) => ({
        ...current,
        display: withoutTrustedSender(current.display, email),
      })),
    [update],
  );

  return {
    settings: settings.display,
    isLoaded,
    updateSettings,
    addTrustedSender,
    removeTrustedSender,
  };
}

export function useMailComposeSettings() {
  const { settings, isLoaded, update } = useMailSyncedSettings();

  const updateSettings = useCallback(
    (patch: Partial<MailComposeSettings>) =>
      update((current) => ({
        ...current,
        compose: { ...current.compose, ...patch },
      })),
    [update],
  );

  return { settings: settings.compose, isLoaded, updateSettings };
}

export function useMailListSettings() {
  const { settings, isLoaded, update } = useMailSyncedSettings();

  const updateSettings = useCallback(
    (patch: Partial<MailListSettings>) =>
      update((current) => ({
        ...current,
        list: { ...current.list, ...patch },
      })),
    [update],
  );

  return { settings: settings.list, isLoaded, updateSettings };
}
