"use client";

import { useCallback, useEffect, useState } from "react";

export type ExternalContentPolicy = "ask" | "block" | "allow";
export type EmailAppearance = "light" | "dark" | "original";

export type MailDisplaySettings = {
  externalContentPolicy: ExternalContentPolicy;
  emailAppearance: EmailAppearance;
  trustedSenders: string[];
  blockTrackingPixels: boolean;
  hideInlineImageAttachments: boolean;
  attachmentImagePreviewsEnabled: boolean;
};

const STORAGE_KEY = "mail:displaySettings";

export const DEFAULT_MAIL_DISPLAY_SETTINGS: MailDisplaySettings = {
  externalContentPolicy: "allow",
  emailAppearance: "dark",
  trustedSenders: [],
  blockTrackingPixels: true,
  hideInlineImageAttachments: true,
  attachmentImagePreviewsEnabled: true,
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function migrateLegacySettings(
  parsed: Partial<MailDisplaySettings> & {
    emailAlwaysLightMode?: boolean;
    mailDarkMode?: boolean;
  },
): MailDisplaySettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_MAIL_DISPLAY_SETTINGS, ...parsed };
  }

  let externalContentPolicy = parsed.externalContentPolicy;
  if (
    externalContentPolicy !== "ask" &&
    externalContentPolicy !== "block" &&
    externalContentPolicy !== "allow"
  ) {
    const legacyBlockRemote = localStorage.getItem("mail:blockRemoteImages");
    externalContentPolicy =
      legacyBlockRemote === "true"
        ? "block"
        : DEFAULT_MAIL_DISPLAY_SETTINGS.externalContentPolicy;
  }

  let blockTrackingPixels = parsed.blockTrackingPixels;
  if (typeof blockTrackingPixels !== "boolean") {
    const legacy = localStorage.getItem("mail:blockTrackingPixels");
    blockTrackingPixels = legacy === null ? true : legacy === "true";
  }

  let emailAppearance = parsed.emailAppearance;
  if (
    emailAppearance !== "light" &&
    emailAppearance !== "dark" &&
    emailAppearance !== "original"
  ) {
    if (parsed.emailAlwaysLightMode === true) {
      emailAppearance = "light";
    } else {
      let mailDarkMode = parsed.mailDarkMode;
      if (typeof mailDarkMode !== "boolean") {
        const legacy = localStorage.getItem("mail:darkMode");
        mailDarkMode = legacy === null ? true : legacy === "true";
      }
      emailAppearance = mailDarkMode ? "dark" : "original";
    }
  }

  return {
    externalContentPolicy:
      externalContentPolicy === "block" ||
      externalContentPolicy === "allow" ||
      externalContentPolicy === "ask"
        ? externalContentPolicy
        : DEFAULT_MAIL_DISPLAY_SETTINGS.externalContentPolicy,
    emailAppearance: emailAppearance ?? DEFAULT_MAIL_DISPLAY_SETTINGS.emailAppearance,
    trustedSenders: Array.isArray(parsed.trustedSenders)
      ? parsed.trustedSenders
          .filter((entry): entry is string => typeof entry === "string")
          .map(normalizeEmail)
      : DEFAULT_MAIL_DISPLAY_SETTINGS.trustedSenders,
    blockTrackingPixels,
    hideInlineImageAttachments:
      typeof parsed.hideInlineImageAttachments === "boolean"
        ? parsed.hideInlineImageAttachments
        : DEFAULT_MAIL_DISPLAY_SETTINGS.hideInlineImageAttachments,
    attachmentImagePreviewsEnabled:
      typeof parsed.attachmentImagePreviewsEnabled === "boolean"
        ? parsed.attachmentImagePreviewsEnabled
        : DEFAULT_MAIL_DISPLAY_SETTINGS.attachmentImagePreviewsEnabled,
  };
}

function parseStoredSettings(raw: string | null): MailDisplaySettings {
  if (!raw) return migrateLegacySettings({});
  try {
    const parsed = JSON.parse(raw) as Partial<MailDisplaySettings>;
    return migrateLegacySettings(parsed);
  } catch {
    return migrateLegacySettings({});
  }
}

export function readMailDisplaySettings(): MailDisplaySettings {
  if (typeof window === "undefined") {
    return DEFAULT_MAIL_DISPLAY_SETTINGS;
  }
  return parseStoredSettings(localStorage.getItem(STORAGE_KEY));
}

export function writeMailDisplaySettings(
  next:
    | MailDisplaySettings
    | ((current: MailDisplaySettings) => MailDisplaySettings),
): MailDisplaySettings {
  const current = readMailDisplaySettings();
  const resolved = typeof next === "function" ? next(current) : next;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
    window.dispatchEvent(new CustomEvent("mail-display-settings-changed"));
  }
  return resolved;
}

export function isTrustedSender(
  email: string | null | undefined,
  settings: Pick<MailDisplaySettings, "trustedSenders">,
): boolean {
  const normalized = email ? normalizeEmail(email) : "";
  if (!normalized) return false;
  return settings.trustedSenders.includes(normalized);
}

export function addTrustedSender(email: string): MailDisplaySettings {
  const normalized = normalizeEmail(email);
  if (!normalized) return readMailDisplaySettings();
  return writeMailDisplaySettings((current) => ({
    ...current,
    trustedSenders: current.trustedSenders.includes(normalized)
      ? current.trustedSenders
      : [...current.trustedSenders, normalized],
  }));
}

export function removeTrustedSender(email: string): MailDisplaySettings {
  const normalized = normalizeEmail(email);
  return writeMailDisplaySettings((current) => ({
    ...current,
    trustedSenders: current.trustedSenders.filter(
      (entry) => entry !== normalized,
    ),
  }));
}

export function shouldBlockRemoteImages(input: {
  policy: ExternalContentPolicy;
  allowExternalContent: boolean;
  senderEmail?: string | null;
  trustedSenders: string[];
}): boolean {
  if (input.policy === "allow") return false;
  if (input.policy === "block") return true;
  if (isTrustedSender(input.senderEmail, { trustedSenders: input.trustedSenders })) {
    return false;
  }
  return !input.allowExternalContent;
}

export function resolveMailContentIsDark(
  settings: Pick<MailDisplaySettings, "emailAppearance">,
): boolean {
  return settings.emailAppearance === "dark";
}

/** True when HTML references http(s) images or other remote resources. */
export function htmlContainsRemoteResources(html: string): boolean {
  if (!html.trim()) return false;
  return (
    /src\s*=\s*["']https?:\/\//i.test(html) ||
    /srcset\s*=\s*["'][^"']*https?:\/\//i.test(html) ||
    /url\s*\(\s*['"]?https?:\/\//i.test(html)
  );
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
