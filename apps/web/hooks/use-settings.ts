import { useState, useEffect, createContext, useContext } from "react";
import { calendarApiService } from "@/lib/calendar-api-service";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
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
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

export function useSettingsState(): SettingsContextValue {
  const { data: session, isPending: isSessionPending } = useSession();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: !!session?.user,
    staleTime: Infinity, // Settings don't change often
    retry: false,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (updates: UpdateSettingsRequest) =>
      calendarApiService.updateUserSettings(updates),
    onSuccess: (newSettings: UserSettings) => {
      queryClient.setQueryData(["settings"], newSettings);
      applyTheme(newSettings.theme);
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => calendarApiService.resetUserSettings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  // Apply theme when settings are loaded
  useEffect(() => {
    if (settingsQuery.data?.theme) {
      applyTheme(settingsQuery.data.theme);
    }
  }, [settingsQuery.data?.theme]);

  return {
    settings: settingsQuery.data || null,
    loading: settingsQuery.isLoading && !settingsQuery.isError, // Don't show loading on error
    error: settingsQuery.error
      ? (settingsQuery.error as any).message || "Failed to load settings"
      : null,
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
      "(prefers-color-scheme: dark)"
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
