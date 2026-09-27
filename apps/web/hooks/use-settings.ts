import { useEffect, createContext, use, useMemo, useRef } from "react";
import { getAccountTimezoneSeed } from "@workspace/calendar-core";
import { calendarApiService } from "@/lib/calendar-api-service";
import type { UserSettings, UpdateSettingsRequest, ApiError } from "@/lib/types/calendar";
import { useSession } from "@/lib/auth-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface SettingsContextValue {
  settings: UserSettings | null;
  loading: boolean;
  error: string | null;
  updateSettings: (updates: UpdateSettingsRequest) => Promise<void>;
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

  // Include the user ID in the key so each user gets their own cache entry.
  // staleTime: Infinity means data is never re-fetched automatically, so
  // scoping by userId prevents a logged-out user's settings from bleeding into
  // the next user's session.
  const settingsQueryKey = useMemo(
    () => ["settings", session?.user?.id ?? null] as const,
    [session?.user?.id],
  );

  const settingsQuery = useQuery<UserSettings, ApiError>({
    queryKey: settingsQueryKey,
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: !!session?.user,
    staleTime: Infinity,
    retry: false,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (updates: UpdateSettingsRequest) =>
      calendarApiService.updateUserSettings(updates),
    onSuccess: (newSettings: UserSettings) => {
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
    mutateSettings({ timezone });
  }, [settingsQuery.data, mutateSettings]);

  return {
    settings: settingsQuery.data || null,
    loading: settingsQuery.isLoading && !settingsQuery.isError,
    error: settingsQuery.error?.message ?? null,
    updateSettings: async (updates) => {
      await updateSettingsMutation.mutateAsync(updates);
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
