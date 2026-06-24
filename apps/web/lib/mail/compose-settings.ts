"use client";

import { useCallback, useEffect, useState } from "react";

export type MailSignaturePosition = "above_quote" | "below_quote";

export type MailComposeSettings = {
  plainTextMode: boolean;
  attachmentReminderEnabled: boolean;
  attachmentReminderKeywords: string[];
  signaturePosition: MailSignaturePosition;
  signatureSeparatorEnabled: boolean;
  autoSelectReplyIdentity: boolean;
};

const STORAGE_KEY = "mail:composeSettings";

export const DEFAULT_ATTACHMENT_REMINDER_KEYWORDS = [
  "attached",
  "attachment",
  "attachments",
  "see attached",
  "find attached",
  "please find attached",
  "angehängt",
  "anhang",
  "anbei",
  "im anhang",
  "ci-joint",
  "pièce jointe",
  "adjunto",
  "adjunta",
  "en adjunto",
  "allegato",
  "in allegato",
  "bijgevoegd",
  "bijlage",
  "em anexo",
  "anexo",
  "w załączniku",
  "во вложении",
  "添付",
  "附件",
  "첨부",
  "pielikumā",
] as const;

export const DEFAULT_MAIL_COMPOSE_SETTINGS: MailComposeSettings = {
  plainTextMode: false,
  attachmentReminderEnabled: true,
  attachmentReminderKeywords: [...DEFAULT_ATTACHMENT_REMINDER_KEYWORDS],
  signaturePosition: "below_quote",
  signatureSeparatorEnabled: true,
  autoSelectReplyIdentity: false,
};

function parseStoredSettings(raw: string | null): MailComposeSettings {
  if (!raw) return DEFAULT_MAIL_COMPOSE_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<MailComposeSettings>;
    return {
      plainTextMode:
        typeof parsed.plainTextMode === "boolean"
          ? parsed.plainTextMode
          : DEFAULT_MAIL_COMPOSE_SETTINGS.plainTextMode,
      attachmentReminderEnabled:
        typeof parsed.attachmentReminderEnabled === "boolean"
          ? parsed.attachmentReminderEnabled
          : DEFAULT_MAIL_COMPOSE_SETTINGS.attachmentReminderEnabled,
      attachmentReminderKeywords: Array.isArray(parsed.attachmentReminderKeywords)
        ? parsed.attachmentReminderKeywords.filter(
            (keyword): keyword is string => typeof keyword === "string",
          )
        : DEFAULT_MAIL_COMPOSE_SETTINGS.attachmentReminderKeywords,
      signaturePosition:
        parsed.signaturePosition === "below_quote" ? "below_quote" : "above_quote",
      signatureSeparatorEnabled:
        typeof parsed.signatureSeparatorEnabled === "boolean"
          ? parsed.signatureSeparatorEnabled
          : DEFAULT_MAIL_COMPOSE_SETTINGS.signatureSeparatorEnabled,
      autoSelectReplyIdentity:
        typeof parsed.autoSelectReplyIdentity === "boolean"
          ? parsed.autoSelectReplyIdentity
          : DEFAULT_MAIL_COMPOSE_SETTINGS.autoSelectReplyIdentity,
    };
  } catch {
    return DEFAULT_MAIL_COMPOSE_SETTINGS;
  }
}

export function findAttachmentReminderKeyword(
  subject: string,
  bodyText: string,
  keywords: readonly string[],
): string | null {
  const searchText = `${subject} ${bodyText}`.toLowerCase();
  return (
    keywords.find((keyword) => searchText.includes(keyword.toLowerCase())) ??
    null
  );
}

/** Returns the matched keyword when send should be blocked for a missing attachment. */
export function shouldWarnAboutMissingAttachment(input: {
  enabled: boolean;
  attachmentCount: number;
  subject: string;
  bodyText: string;
  keywords: readonly string[];
}): string | null {
  if (!input.enabled || input.attachmentCount > 0) {
    return null;
  }
  return findAttachmentReminderKeyword(
    input.subject,
    input.bodyText,
    input.keywords,
  );
}

export function readMailComposeSettings(): MailComposeSettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_COMPOSE_SETTINGS;
  }
  return parseStoredSettings(localStorage.getItem(STORAGE_KEY));
}

export function writeMailComposeSettings(
  next: MailComposeSettings | ((current: MailComposeSettings) => MailComposeSettings),
): MailComposeSettings {
  const current = readMailComposeSettings();
  const resolved = typeof next === "function" ? next(current) : next;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
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
