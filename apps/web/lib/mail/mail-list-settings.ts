"use client";

import { useCallback, useEffect, useState } from "react";

export type ListDensity = "compact" | "comfortable";
export type MarkAsReadDelay = "instant" | "delayed" | "never";

export type MailListSettings = {
  density: ListDensity;
  markAsReadDelay: MarkAsReadDelay;
  threadExpandInList: boolean;
  undoToastDurationMs: number;
  showLabelChipsInList: boolean;
  keyboardShortcutsEnabled: boolean;
};

const STORAGE_KEY = "mail:listSettings";

export const DEFAULT_MAIL_LIST_SETTINGS: MailListSettings = {
  density: "compact",
  markAsReadDelay: "instant",
  threadExpandInList: true,
  undoToastDurationMs: 5000,
  showLabelChipsInList: true,
  keyboardShortcutsEnabled: true,
};

function parseStoredSettings(raw: string | null): MailListSettings {
  if (!raw) return DEFAULT_MAIL_LIST_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<MailListSettings>;
    return {
      density:
        parsed.density === "comfortable" || parsed.density === "compact"
          ? parsed.density
          : DEFAULT_MAIL_LIST_SETTINGS.density,
      markAsReadDelay:
        parsed.markAsReadDelay === "instant" ||
        parsed.markAsReadDelay === "delayed" ||
        parsed.markAsReadDelay === "never"
          ? parsed.markAsReadDelay
          : DEFAULT_MAIL_LIST_SETTINGS.markAsReadDelay,
      threadExpandInList:
        typeof parsed.threadExpandInList === "boolean"
          ? parsed.threadExpandInList
          : DEFAULT_MAIL_LIST_SETTINGS.threadExpandInList,
      undoToastDurationMs:
        typeof parsed.undoToastDurationMs === "number" &&
        parsed.undoToastDurationMs >= 2000 &&
        parsed.undoToastDurationMs <= 15000
          ? parsed.undoToastDurationMs
          : DEFAULT_MAIL_LIST_SETTINGS.undoToastDurationMs,
      showLabelChipsInList:
        typeof parsed.showLabelChipsInList === "boolean"
          ? parsed.showLabelChipsInList
          : DEFAULT_MAIL_LIST_SETTINGS.showLabelChipsInList,
      keyboardShortcutsEnabled:
        typeof parsed.keyboardShortcutsEnabled === "boolean"
          ? parsed.keyboardShortcutsEnabled
          : DEFAULT_MAIL_LIST_SETTINGS.keyboardShortcutsEnabled,
    };
  } catch {
    return DEFAULT_MAIL_LIST_SETTINGS;
  }
}

export function readMailListSettings(): MailListSettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_LIST_SETTINGS;
  }
  return parseStoredSettings(localStorage.getItem(STORAGE_KEY));
}

export function writeMailListSettings(
  next: MailListSettings | ((current: MailListSettings) => MailListSettings),
): MailListSettings {
  const current = readMailListSettings();
  const resolved = typeof next === "function" ? next(current) : next;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
    window.dispatchEvent(new CustomEvent("mail-list-settings-changed"));
  }
  return resolved;
}

export const MARK_AS_READ_DELAY_MS = 3000;

export function useMailListSettings() {
  const [settings, setSettings] = useState<MailListSettings>(() =>
    readMailListSettings(),
  );

  useEffect(() => {
    const refresh = () => {
      setSettings(readMailListSettings());
    };
    window.addEventListener("mail-list-settings-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("mail-list-settings-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<MailListSettings>) => {
      setSettings(writeMailListSettings((current) => ({ ...current, ...patch })));
    },
    [],
  );

  return { settings, updateSettings };
}
