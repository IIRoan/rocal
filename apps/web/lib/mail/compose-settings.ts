"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  parseMailComposeSettings,
  serializeMailComposeSettings,
  type MailComposeSettings,
} from "@workspace/calendar-core";
import { MAIL_COMPOSE_SETTINGS_STORAGE_KEY } from "./mail-settings-storage";
import { scheduleMailSettingsServerSync } from "./schedule-mail-settings-sync";

export {
  DEFAULT_ATTACHMENT_REMINDER_KEYWORDS,
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  findAttachmentReminderKeyword,
  shouldWarnAboutMissingAttachment,
  type MailComposeSettings,
  type MailSignaturePosition,
} from "@workspace/calendar-core";

const STORAGE_KEY = MAIL_COMPOSE_SETTINGS_STORAGE_KEY;

export function readMailComposeSettings(): MailComposeSettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_COMPOSE_SETTINGS;
  }
  return parseMailComposeSettings(localStorage.getItem(STORAGE_KEY));
}

export function writeMailComposeSettings(
  next: MailComposeSettings | ((current: MailComposeSettings) => MailComposeSettings),
  options?: { sync?: boolean },
): MailComposeSettings {
  const current = readMailComposeSettings();
  const resolved = typeof next === "function" ? next(current) : next;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, serializeMailComposeSettings(resolved));
    window.dispatchEvent(new CustomEvent("mail-compose-settings-changed"));
    if (options?.sync !== false) {
      scheduleMailSettingsServerSync();
    }
  }
  return resolved;
}

export function useMailComposeSettings() {
  const [settings, setSettings] = useState<MailComposeSettings>(() =>
    readMailComposeSettings(),
  );

  useEffect(() => {
    const refresh = () => {
      setSettings(readMailComposeSettings());
    };
    window.addEventListener("mail-compose-settings-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("mail-compose-settings-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<MailComposeSettings>) => {
      setSettings(writeMailComposeSettings((current) => ({ ...current, ...patch })));
    },
    [],
  );

  return { settings, updateSettings };
}
