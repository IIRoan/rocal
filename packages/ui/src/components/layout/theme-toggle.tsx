"use client";

import { Moon, Sun } from "lucide-react";
import { createLogger } from "@workspace/logger";
import { useTheme } from "next-themes";
import { useId, useSyncExternalStore } from "react";

const log = createLogger("theme-toggle");

const subscribeToNothing = () => () => {};

interface ThemeToggleProps {
  useSettingsTheme?: {
    currentTheme: "light" | "dark" | "system";
    updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  };
}

export function ThemeToggle({ useSettingsTheme }: ThemeToggleProps = {}) {
  const id = useId();
  const {
    theme: nextTheme,
    resolvedTheme,
    setTheme: setNextTheme,
  } = useTheme();
  // The server cannot know the applied theme, so the checked state appears only after hydration.
  const isMounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const currentTheme = useSettingsTheme?.currentTheme || nextTheme || "system";
  const updateTheme =
    useSettingsTheme?.updateTheme ||
    ((theme: string) => {
      setNextTheme(theme);
      return Promise.resolve();
    });

  const smartToggle = async () => {
    const prefersDarkScheme = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

    let newTheme: "light" | "dark" | "system";

    if (currentTheme === "system") {
      newTheme = prefersDarkScheme ? "light" : "dark";
    } else if (
      (currentTheme === "light" && !prefersDarkScheme) ||
      (currentTheme === "dark" && prefersDarkScheme)
    ) {
      newTheme = currentTheme === "light" ? "dark" : "light";
    } else {
      newTheme = "system";
    }

    try {
      await updateTheme(newTheme);
    } catch (error) {
      log.error("Failed to update theme:", error);
    }
  };

  return (
    <div className="flex flex-col justify-center">
      <input
        type="checkbox"
        name="theme-toggle"
        id={id}
        className="peer sr-only"
        checked={isMounted && resolvedTheme === "dark"}
        onChange={smartToggle}
        aria-label="Dark mode"
      />
      <label
        className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-foreground outline-none transition-[color,background-color,box-shadow] hover:bg-hover hover:text-hover-foreground peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring"
        htmlFor={id}
        aria-hidden="true"
      >
        <Sun size={20} className="dark:hidden" />
        <Moon size={20} className="hidden dark:block" />
      </label>
    </div>
  );
}
