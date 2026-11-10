"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  parseMailDisplaySettings,
  withTrustedSender,
  withoutTrustedSender,
  type MailDisplaySettings,
} from "@workspace/calendar-core";
import {
  MAIL_DISPLAY_SETTINGS_STORAGE_KEY,
  readLocalTrustedSenders,
  restoreLocalTrustedSenders,
  writeLocalTrustedSenders,
} from "./mail-settings-storage";
import { scheduleMailSettingsServerSync } from "./schedule-mail-settings-sync";

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

const STORAGE_KEY = MAIL_DISPLAY_SETTINGS_STORAGE_KEY;

function serializeDisplayPreferences(settings: MailDisplaySettings): string {
  const preferences = {
    externalContentPolicy: settings.externalContentPolicy,
    emailAppearance: settings.emailAppearance,
    blockTrackingPixels: settings.blockTrackingPixels,
    hideInlineImageAttachments: settings.hideInlineImageAttachments,
    attachmentImagePreviewsEnabled: settings.attachmentImagePreviewsEnabled,
  } satisfies Omit<MailDisplaySettings, "trustedSenders">;
  return JSON.stringify(preferences);
}

export function readMailDisplaySettings(): MailDisplaySettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_DISPLAY_SETTINGS;
  }
  const settings = parseMailDisplaySettings(localStorage.getItem(STORAGE_KEY), {
    blockRemoteImages: localStorage.getItem("mail:blockRemoteImages"),
    blockTrackingPixels: localStorage.getItem("mail:blockTrackingPixels"),
    darkMode: localStorage.getItem("mail:darkMode"),
  });
  if (settings.trustedSenders.length > 0) {
    writeLocalTrustedSenders(settings.trustedSenders);
    localStorage.setItem(STORAGE_KEY, serializeDisplayPreferences(settings));
  }
  return { ...settings, trustedSenders: readLocalTrustedSenders() };
}

export function writeMailDisplaySettings(
  next:
    | MailDisplaySettings
    | ((current: MailDisplaySettings) => MailDisplaySettings),
  options?: { sync?: boolean },
): MailDisplaySettings {
  const current = readMailDisplaySettings();
  const resolved = typeof next === "function" ? next(current) : next;
  if (typeof window !== "undefined") {
    if (resolved.trustedSenders.length !== current.trustedSenders.length ||
      resolved.trustedSenders.some((email, index) => email !== current.trustedSenders[index])) {
      writeLocalTrustedSenders(resolved.trustedSenders);
    }
    localStorage.setItem(STORAGE_KEY, serializeDisplayPreferences(resolved));
    window.dispatchEvent(new CustomEvent("mail-display-settings-changed"));
    if (options?.sync !== false) {
      scheduleMailSettingsServerSync();
    }
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
    const refreshStored = () => {
      void restoreLocalTrustedSenders().then(refresh).catch(refresh);
    };
    window.addEventListener("mail-display-settings-changed", refresh);
    window.addEventListener("storage", refreshStored);
    return () => {
      window.removeEventListener("mail-display-settings-changed", refresh);
      window.removeEventListener("storage", refreshStored);
    };
  }, []);

  const updateSettings = (patch: Partial<MailDisplaySettings>) => {
    setSettings(writeMailDisplaySettings((current) => ({ ...current, ...patch })));
  };

  return { settings, updateSettings };
}
