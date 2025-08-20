import { useState, useEffect, createContext, useContext } from "react";
import { calendarApiService } from "@/lib/calendar-api-service";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
import { useSession } from "@/lib/auth-client";

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
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: session, isPending } = useSession();

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const userSettings = await calendarApiService.getUserSettings();
      setSettings(userSettings);
    } catch (err: any) {
      // Quietly ignore unauthorized errors when the user isn't logged in
      if (err?.statusCode === 401 || err?.status === 401) {
        setSettings(null);
        setError(null);
      } else {
        setError(err.message || "Failed to load settings");
        console.error("Failed to fetch user settings:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: UpdateSettingsRequest) => {
    try {
      setError(null);
      const updatedSettings =
        await calendarApiService.updateUserSettings(updates);
      setSettings(updatedSettings);

      // Apply theme immediately
      applyTheme(updatedSettings.theme);
    } catch (err: any) {
      setError(err.message || "Failed to update settings");
      throw err;
    }
  };

  const resetSettings = async () => {
    try {
      setError(null);
      await calendarApiService.resetUserSettings();
      await fetchSettings();
    } catch (err: any) {
      setError(err.message || "Failed to reset settings");
      throw err;
    }
  };

  const refetchSettings = async () => {
    await fetchSettings();
  };

  // Load settings only when user is authenticated; avoid 401s on public pages
  useEffect(() => {
    if (!isPending && session?.user) {
      fetchSettings();
    } else if (!isPending && !session?.user) {
      // Not authenticated: ensure clean state and not loading
      setSettings(null);
      setError(null);
      setLoading(false);
    }
  }, [isPending, session?.user]);

  // Apply theme when settings change
  useEffect(() => {
    if (settings?.theme) {
      applyTheme(settings.theme);
    }
  }, [settings?.theme]);

  return {
    settings,
    loading,
    error,
    updateSettings,
    resetSettings,
    refetchSettings,
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
