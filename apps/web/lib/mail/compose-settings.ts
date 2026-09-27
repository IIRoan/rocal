"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  parseMailComposeSettings,
  serializeMailComposeSettings,
  type MailComposeSettings,
} from "@workspace/calendar-core";

export {
  DEFAULT_ATTACHMENT_REMINDER_KEYWORDS,
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  findAttachmentReminderKeyword,
  shouldWarnAboutMissingAttachment,
  type MailComposeSettings,
  type MailSignaturePosition,
} from "@workspace/calendar-core";

const STORAGE_KEY = "mail:composeSettings";

export function readMailComposeSettings(): MailComposeSettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_COMPOSE_SETTINGS;
  }
  return parseMailComposeSettings(localStorage.getItem(STORAGE_KEY));
}

export function writeMailComposeSettings(
  next: MailComposeSettings | ((current: MailComposeSettings) => MailComposeSettings),
): MailComposeSettings {
  const current = readMailComposeSettings();
  const resolved = typeof next === "function" ? next(current) : next;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, serializeMailComposeSettings(resolved));
    window.dispatchEvent(new CustomEvent("mail-compose-settings-changed"));
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
