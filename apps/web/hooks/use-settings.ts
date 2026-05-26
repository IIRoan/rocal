import { useEffect, createContext, use, useMemo } from "react";
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
    staleTime: Infinity, // Settings don't change often
    retry: false,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (updates: UpdateSettingsRequest) =>
      calendarApiService.updateUserSettings(updates),
    onSuccess: (newSettings: UserSettings) => {
      queryClient.setQueryData<UserSettings>(settingsQueryKey, newSettings);
      applyTheme(newSettings.theme);
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => calendarApiService.resetUserSettings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    },
  });

  // Apply theme when settings are loaded
  useEffect(() => {
    if (settingsQuery.data?.theme) {
      // Check if there's a pending theme sync from the login page
      const pendingTheme = localStorage.getItem("pending-theme-sync") as
        | "light"
        | "dark"
        | "system"
        | null;
      if (pendingTheme && pendingTheme !== settingsQuery.data.theme) {
        localStorage.removeItem("pending-theme-sync");
        updateSettingsMutation.mutate({ theme: pendingTheme });
      } else {
        localStorage.removeItem("pending-theme-sync");
        applyTheme(settingsQuery.data.theme);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQuery.data?.theme]);

  return {
    settings: settingsQuery.data || null,
    loading: settingsQuery.isLoading && !settingsQuery.isError, // Don't show loading on error
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

function applyTheme(theme: "light" | "dark" | "system") {
  const root = document.documentElement;

  if (theme === "system") {
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    root.classList.toggle("dark", systemPrefersDark);
  } else {
    root.classList.toggle("dark", theme === "dark");
  }

  // Store theme preference
  localStorage.setItem("theme", theme);
}

// Initialize theme on page load
if (typeof window !== "undefined") {
  const storedTheme = localStorage.getItem("theme") as
    | "light"
    | "dark"
    | "system"
    | null;
  if (storedTheme) {
    applyTheme(storedTheme);
  } else {
    // Default to system theme
    applyTheme("system");
  }
}

export { SettingsContext };
