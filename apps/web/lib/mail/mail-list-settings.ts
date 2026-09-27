"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MAIL_LIST_SETTINGS,
  parseMailListSettings,
  type MailListSettings,
} from "@workspace/calendar-core";

export {
  DEFAULT_MAIL_LIST_SETTINGS,
  MARK_AS_READ_DELAY_MS,
  type ListDensity,
  type MailListSettings,
  type MarkAsReadDelay,
} from "@workspace/calendar-core";

const STORAGE_KEY = "mail:listSettings";

export function readMailListSettings(): MailListSettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_LIST_SETTINGS;
  }
  return parseMailListSettings(localStorage.getItem(STORAGE_KEY));
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
