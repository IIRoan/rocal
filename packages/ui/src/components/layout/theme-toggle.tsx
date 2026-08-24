"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { createLogger } from "@workspace/logger";
import { useTheme } from "next-themes";
import { useId } from "react";

const log = createLogger("theme-toggle");

interface ThemeToggleProps {
  useSettingsTheme?: {
    currentTheme: "light" | "dark" | "system";
    updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  };
}

export function ThemeToggle({ useSettingsTheme }: ThemeToggleProps = {}) {
  const id = useId();
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();

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
        checked={currentTheme === "system"}
        onChange={smartToggle}
        aria-label="Toggle dark mode"
      />
      <label
        className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-foreground outline-none transition-[color,background-color,box-shadow] hover:bg-accent hover:text-accent-foreground peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
        htmlFor={id}
        aria-hidden="true"
      >
        <span className="absolute size-5 scale-100 rotate-0 transition-all duration-300 dark:scale-0 dark:-rotate-90">
          <SunIcon size={20} className="fill-current" />
        </span>
        <span className="absolute size-5 scale-0 rotate-90 transition-all duration-300 dark:scale-100 dark:rotate-0">
          <MoonIcon size={20} className="fill-current" />
        </span>
        <span className="sr-only">Switch to system/light/dark version</span>
      </label>
    </div>
  );
}
