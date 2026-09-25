import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import {
  nativeLightTheme,
  nativeDarkTheme,
  nativeMailDarkTheme,
  nativeMailLightTheme,
  type ThemeTokens,
} from "@workspace/design-tokens";

export type ThemePreference = "light" | "dark" | "system";

export interface ThemeContextValue {
  theme: ThemeTokens;
  colorScheme: "light" | "dark";
  isDark: boolean;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_PREF_CACHE_KEY = "THEME_PREFERENCE";

/** Synchronous mirror of the async secure-store preference, so a remount does not flash the wrong theme. */
let cachedPreference: ThemePreference | null = null;

async function loadThemePreference(): Promise<ThemePreference> {
  if (cachedPreference) return cachedPreference;

  try {
    // Dynamic import so the module is only loaded at runtime (not in tests).
    const SecureStore = await import("expo-secure-store");
    const stored = await SecureStore.getItemAsync(THEME_PREF_CACHE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      cachedPreference = stored;
      return stored;
    }
  } catch {
    // Secure store unavailable (e.g. in tests) — fall through.
  }

  cachedPreference = "system";
  return "system";
}

async function saveThemePreference(pref: ThemePreference): Promise<void> {
  cachedPreference = pref;
  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(THEME_PREF_CACHE_KEY, pref);
  } catch {
    // Secure store unavailable — preference lives only in memory.
  }
}

function resolveTheme(
  preference: ThemePreference,
  systemScheme: "light" | "dark",
): { theme: ThemeTokens; colorScheme: "light" | "dark" } {
  const colorScheme = preference === "system" ? systemScheme : preference;
  return {
    theme: colorScheme === "dark" ? nativeDarkTheme : nativeLightTheme,
    colorScheme,
  };
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const systemScheme = (useColorScheme() ?? "light") as "light" | "dark";
  const [preference, setPreference] = useState<ThemePreference>(
    cachedPreference ?? "system",
  );
  const [isReady, setIsReady] = useState(cachedPreference !== null);

  useEffect(() => {
    let cancelled = false;
    loadThemePreference().then((pref) => {
      if (!cancelled) {
        setPreference(pref);
        setIsReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetPreference = useCallback((pref: ThemePreference) => {
    setPreference(pref);
    saveThemePreference(pref);
  }, []);

  const { theme, colorScheme } = resolveTheme(preference, systemScheme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colorScheme,
      isDark: colorScheme === "dark",
      themePreference: preference,
      setThemePreference: handleSetPreference,
    }),
    [theme, colorScheme, preference, handleSetPreference],
  );

  // Wait for the persisted preference so there is no flash of the wrong theme.
  if (!isReady) return <></>;

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Re-themes calendar and mail with the Solace palette, like `[data-solace]` scopes web mail. */
export function WorkspaceThemeScope({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const parent = useTheme();
  const value = useMemo<ThemeContextValue>(
    () => ({
      ...parent,
      theme: parent.isDark ? nativeMailDarkTheme : nativeMailLightTheme,
    }),
    [parent],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

// Exported for testing
export { resolveTheme, THEME_PREF_CACHE_KEY };
