"use client";

import { RiMoonClearLine, RiSunLine } from "@remixicon/react";
import { useTheme } from "next-themes";
import { useId } from "react";

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
      console.error("Failed to update theme:", error);
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
        className="text-muted-foreground/80 hover:text-foreground/80 rounded peer-focus-visible:border-ring peer-focus-visible:ring-ring/50 relative inline-flex size-8 cursor-pointer items-center justify-center transition-[color,box-shadow] outline-none peer-focus-visible:ring-[3px]"
        htmlFor={id}
        aria-hidden="true"
      >
        <RiSunLine className="dark:hidden" size={20} aria-hidden="true" />
        <RiMoonClearLine
          className="hidden dark:block"
          size={20}
          aria-hidden="true"
        />
        <span className="sr-only">Switch to system/light/dark version</span>
      </label>
    </div>
  );
}
