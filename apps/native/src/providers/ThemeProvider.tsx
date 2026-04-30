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
  type ThemeTokens,
} from "@workspace/design-tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemePreference = "light" | "dark" | "system";

export interface ThemeContextValue {
  /** Resolved theme tokens for the active color scheme. */
  theme: ThemeTokens;
  /** The active color scheme after resolving "system". */
  colorScheme: "light" | "dark";
  /** Convenience boolean — true when the dark theme is active. */
  isDark: boolean;
  /** The raw user preference (may be "system"). */
  themePreference: ThemePreference;
  /** Persist a new theme preference. */
  setThemePreference: (pref: ThemePreference) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Local cache helpers
// ---------------------------------------------------------------------------

const THEME_PREF_CACHE_KEY = "THEME_PREFERENCE";

/**
 * In-memory cache for the theme preference.
 *
 * `expo-secure-store` is async, so we keep a synchronous mirror that is
 * populated on mount and updated on every write.  This avoids a flash of
 * the wrong theme on cold start.
 */
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

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

function resolveTheme(
  preference: ThemePreference,
  systemScheme: "light" | "dark",
): { theme: ThemeTokens; colorScheme: "light" | "dark" } {
  const colorScheme =
    preference === "system" ? systemScheme : preference;
  return {
    theme: colorScheme === "dark" ? nativeDarkTheme : nativeLightTheme,
    colorScheme,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

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

  // Hydrate from secure store on mount.
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

  // Avoid rendering children until the persisted preference is loaded so
  // there is no flash of the wrong theme.
  if (!isReady) return <></>;

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

// Exported for testing
export { resolveTheme, THEME_PREF_CACHE_KEY };
