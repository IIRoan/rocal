import { useEffect, createContext, use, useRef } from "react";
import { getAccountTimezoneSeed } from "@workspace/calendar-core";
import { webQueryKeys } from "@/lib/query-keys";
import { calendarApiService } from "@/lib/calendar-api-service";
import type {
  UserSettings,
  UpdateSettingsRequest,
  ApiError,
} from "@/lib/types/calendar";
import { useSession } from "@/lib/auth-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface SettingsContextValue {
  settings: UserSettings | null;
  loading: boolean;
  error: string | null;
  updateSettings: (
    updates: UpdateSettingsRequest,
    isCurrent?: () => boolean,
  ) => Promise<void>;
  resetSettings: () => Promise<void>;
  refetchSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings() {
  const context = use(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

export function useSettingsState(): SettingsContextValue {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const seededSettingsId = useRef<string | null>(null);

  // Scope indefinitely cached settings to the signed-in user to prevent cross-account reuse.
  const settingsQueryKey = webQueryKeys.settings(session?.user?.id ?? null);

  const settingsQuery = useQuery<UserSettings, ApiError>({
    queryKey: settingsQueryKey,
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: !!session?.user,
    staleTime: Infinity,
    retry: false,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (input: {
      updates: UpdateSettingsRequest;
      isCurrent?: () => boolean;
    }) => calendarApiService.updateUserSettings(input.updates, input.isCurrent),
    onMutate: async ({ updates, isCurrent }) => {
      if (isCurrent && !isCurrent()) return { previous: undefined };
      await queryClient.cancelQueries({
        queryKey: settingsQueryKey,
        exact: true,
      });
      const previous = queryClient.getQueryData<UserSettings>(settingsQueryKey);
      // Integration enables only after sealed settings commit, so failed saves cannot import events.
      const { riftbound: _riftbound, ...optimistic } = updates;
      if (previous)
        queryClient.setQueryData<UserSettings>(settingsQueryKey, {
          ...previous,
          ...optimistic,
        });
      return { previous };
    },
    onError: (_error, input, context) => {
      if (input.isCurrent && !input.isCurrent()) return;
      if (context?.previous)
        queryClient.setQueryData(settingsQueryKey, context.previous);
    },
    onSuccess: (newSettings: UserSettings, input) => {
      if (input.isCurrent && !input.isCurrent()) return;
      queryClient.setQueryData<UserSettings>(settingsQueryKey, newSettings);
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => calendarApiService.resetUserSettings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    },
  });

  const { mutate: mutateSettings } = updateSettingsMutation;
  // One attempt per settings row (a reset creates a new one), so a failed seed never loops.
  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings || seededSettingsId.current === settings.id) return;
    const timezone = getAccountTimezoneSeed(settings);
    if (!timezone) return;
    seededSettingsId.current = settings.id;
    mutateSettings({ updates: { timezone } });
  }, [settingsQuery.data, mutateSettings]);

  return {
    settings: settingsQuery.data || null,
    loading: settingsQuery.isLoading && !settingsQuery.isError,
    error: settingsQuery.error?.message ?? null,
    updateSettings: async (updates, isCurrent) => {
      await updateSettingsMutation.mutateAsync({ updates, isCurrent });
    },
    resetSettings: async () => {
      await resetSettingsMutation.mutateAsync();
    },
    refetchSettings: async () => {
      await settingsQuery.refetch();
    },
  };
}

export { SettingsContext };
