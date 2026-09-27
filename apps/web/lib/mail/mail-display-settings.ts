"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  parseMailDisplaySettings,
  serializeMailDisplaySettings,
  withTrustedSender,
  withoutTrustedSender,
  type MailDisplaySettings,
} from "@workspace/calendar-core";

export {
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  TRUSTED_SENDER_DESCRIPTION,
  isTrustedSender,
  resolveMailContentIsDark,
  resolveReaderRemoteContent,
  shouldBlockRemoteImages,
  type EmailAppearance,
  type ExternalContentPolicy,
  type MailDisplaySettings,
} from "@workspace/calendar-core";

const STORAGE_KEY = "mail:displaySettings";

export function readMailDisplaySettings(): MailDisplaySettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_DISPLAY_SETTINGS;
  }
  return parseMailDisplaySettings(localStorage.getItem(STORAGE_KEY), {
    blockRemoteImages: localStorage.getItem("mail:blockRemoteImages"),
    blockTrackingPixels: localStorage.getItem("mail:blockTrackingPixels"),
    darkMode: localStorage.getItem("mail:darkMode"),
  });
}

export function writeMailDisplaySettings(
  next:
    | MailDisplaySettings
    | ((current: MailDisplaySettings) => MailDisplaySettings),
): MailDisplaySettings {
  const current = readMailDisplaySettings();
  const resolved = typeof next === "function" ? next(current) : next;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, serializeMailDisplaySettings(resolved));
    window.dispatchEvent(new CustomEvent("mail-display-settings-changed"));
  }
  return resolved;
}

export function addTrustedSender(email: string): MailDisplaySettings {
  return writeMailDisplaySettings((current) => withTrustedSender(current, email));
}

export function removeTrustedSender(email: string): MailDisplaySettings {
  return writeMailDisplaySettings((current) => withoutTrustedSender(current, email));
}

export function useMailDisplaySettings() {
  const [settings, setSettings] = useState<MailDisplaySettings>(() =>
    readMailDisplaySettings(),
  );

  useEffect(() => {
    const refresh = () => {
      setSettings(readMailDisplaySettings());
    };
    window.addEventListener("mail-display-settings-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("mail-display-settings-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<MailDisplaySettings>) => {
      setSettings(writeMailDisplaySettings((current) => ({ ...current, ...patch })));
    },
    [],
  );

  return { settings, updateSettings };
}
