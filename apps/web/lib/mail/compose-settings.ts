"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  parseMailComposeSettings,
  serializeMailComposeSettings,
  type MailComposeSettings,
} from "@workspace/calendar-core";
import {
  MAIL_COMPOSE_SETTINGS_STORAGE_KEY,
  readLocalMailSignatures,
  readLocalMailTemplates,
  restoreLocalMailSignatures,
  restoreLocalMailTemplates,
  writeLocalMailSignatures,
  writeLocalMailTemplates,
} from "./mail-settings-storage";
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

/** Templates and signatures are user content, so they live only in the sealed store; every other key stays here. */
function serializeComposePreferences(settings: MailComposeSettings): string {
  return serializeMailComposeSettings({ ...settings, templates: [], signatures: [] });
}

export function readMailComposeSettings(): MailComposeSettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_COMPOSE_SETTINGS;
  }
  return {
    ...parseMailComposeSettings(localStorage.getItem(STORAGE_KEY)),
    templates: readLocalMailTemplates(),
    signatures: readLocalMailSignatures(),
  };
}

export function writeMailComposeSettings(
  next: MailComposeSettings | ((current: MailComposeSettings) => MailComposeSettings),
  options?: { sync?: boolean },
): MailComposeSettings {
  const current = readMailComposeSettings();
  const resolved = typeof next === "function" ? next(current) : next;
  if (typeof window !== "undefined") {
    if (JSON.stringify(resolved.templates) !== JSON.stringify(current.templates)) {
      writeLocalMailTemplates(resolved.templates);
    }
    if (JSON.stringify(resolved.signatures) !== JSON.stringify(current.signatures)) {
      writeLocalMailSignatures(resolved.signatures);
    }
    localStorage.setItem(STORAGE_KEY, serializeComposePreferences(resolved));
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
    const refreshStored = () => {
      void Promise.all([restoreLocalMailTemplates(), restoreLocalMailSignatures()])
        .then(refresh)
        .catch(refresh);
    };
    window.addEventListener("mail-compose-settings-changed", refresh);
    window.addEventListener("storage", refreshStored);
    return () => {
      window.removeEventListener("mail-compose-settings-changed", refresh);
      window.removeEventListener("storage", refreshStored);
    };
  }, []);

  const updateSettings = (patch: Partial<MailComposeSettings>) => {
    setSettings(writeMailComposeSettings((current) => ({ ...current, ...patch })));
  };

  return { settings, updateSettings };
}
