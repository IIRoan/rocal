import { normalizeEmailAddress } from "./mail-addresses";

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

/** Pre-JSON web storage values; native has no legacy keys. */
export type LegacyMailDisplayValues = {
  blockRemoteImages?: string | null;
  blockTrackingPixels?: string | null;
  darkMode?: string | null;
};

export const EXTERNAL_CONTENT_POLICIES: readonly ExternalContentPolicy[] = [
  "ask",
  "block",
  "allow",
];

export const EMAIL_APPEARANCES: readonly EmailAppearance[] = [
  "dark",
  "light",
  "original",
];

/** Remote content is blocked until the user opts in per message or per sender. */
export const DEFAULT_MAIL_DISPLAY_SETTINGS: MailDisplaySettings = {
  externalContentPolicy: "ask",
  emailAppearance: "dark",
  trustedSenders: [],
  blockTrackingPixels: true,
  hideInlineImageAttachments: true,
  attachmentImagePreviewsEnabled: true,
};

export const TRUSTED_SENDER_DESCRIPTION =
  "Remote images from these senders load automatically when the policy is set to ask.";

function isExternalContentPolicy(value: unknown): value is ExternalContentPolicy {
  return value === "ask" || value === "block" || value === "allow";
}

function isEmailAppearance(value: unknown): value is EmailAppearance {
  return value === "light" || value === "dark" || value === "original";
}

function normalizeTrustedSenders(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_MAIL_DISPLAY_SETTINGS.trustedSenders];
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map(normalizeEmailAddress)
    .filter(Boolean);
  return [...new Set(normalized)];
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeMailDisplaySettings(
  input: unknown,
  legacy: LegacyMailDisplayValues = {},
): MailDisplaySettings {
  const parsed: Record<string, unknown> =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const externalContentPolicy = isExternalContentPolicy(parsed.externalContentPolicy)
    ? parsed.externalContentPolicy
    : legacy.blockRemoteImages === "true"
      ? "block"
      : DEFAULT_MAIL_DISPLAY_SETTINGS.externalContentPolicy;

  const blockTrackingPixels =
    typeof parsed.blockTrackingPixels === "boolean"
      ? parsed.blockTrackingPixels
      : legacy.blockTrackingPixels == null
        ? DEFAULT_MAIL_DISPLAY_SETTINGS.blockTrackingPixels
        : legacy.blockTrackingPixels === "true";

  let emailAppearance: EmailAppearance;
  if (isEmailAppearance(parsed.emailAppearance)) {
    emailAppearance = parsed.emailAppearance;
  } else if (parsed.emailAlwaysLightMode === true) {
    emailAppearance = "light";
  } else {
    const mailDarkMode =
      typeof parsed.mailDarkMode === "boolean"
        ? parsed.mailDarkMode
        : legacy.darkMode == null
          ? true
          : legacy.darkMode === "true";
    emailAppearance = mailDarkMode ? "dark" : "original";
  }

  return {
    externalContentPolicy,
    emailAppearance,
    trustedSenders: normalizeTrustedSenders(parsed.trustedSenders),
    blockTrackingPixels,
    hideInlineImageAttachments: booleanOr(
      parsed.hideInlineImageAttachments,
      DEFAULT_MAIL_DISPLAY_SETTINGS.hideInlineImageAttachments,
    ),
    attachmentImagePreviewsEnabled: booleanOr(
      parsed.attachmentImagePreviewsEnabled,
      DEFAULT_MAIL_DISPLAY_SETTINGS.attachmentImagePreviewsEnabled,
    ),
  };
}

export function parseMailDisplaySettings(
  raw: string | null | undefined,
  legacy: LegacyMailDisplayValues = {},
): MailDisplaySettings {
  if (!raw) return normalizeMailDisplaySettings({}, legacy);
  try {
    return normalizeMailDisplaySettings(JSON.parse(raw), legacy);
  } catch {
    return normalizeMailDisplaySettings({}, legacy);
  }
}

export function serializeMailDisplaySettings(settings: MailDisplaySettings): string {
  return JSON.stringify(settings);
}

export function isTrustedSender(
  email: string | null | undefined,
  settings: Pick<MailDisplaySettings, "trustedSenders">,
): boolean {
  const normalized = email ? normalizeEmailAddress(email) : "";
  if (!normalized) return false;
  return settings.trustedSenders.includes(normalized);
}

export function withTrustedSender<T extends Pick<MailDisplaySettings, "trustedSenders">>(
  settings: T,
  email: string,
): T {
  const normalized = normalizeEmailAddress(email);
  if (!normalized || settings.trustedSenders.includes(normalized)) return settings;
  return { ...settings, trustedSenders: [...settings.trustedSenders, normalized] };
}

export function withoutTrustedSender<T extends Pick<MailDisplaySettings, "trustedSenders">>(
  settings: T,
  email: string,
): T {
  const normalized = normalizeEmailAddress(email);
  return {
    ...settings,
    trustedSenders: settings.trustedSenders.filter((entry) => entry !== normalized),
  };
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

/** Actions offered above a message whose remote content is currently blocked, or null when nothing is blocked. */
export function resolveRemoteContentPrompt(input: {
  policy: ExternalContentPolicy;
  blockRemoteImages: boolean;
  hasRemoteContent: boolean;
  senderEmail?: string | null;
}): { canLoadOnce: boolean; canTrustSender: boolean } | null {
  if (!input.blockRemoteImages || input.policy === "allow" || !input.hasRemoteContent) {
    return null;
  }
  return {
    canLoadOnce: input.policy === "ask",
    canTrustSender: input.policy === "ask" && Boolean(input.senderEmail?.trim()),
  };
}

/** Reader decision for one message; `hasRemoteContent` must come from `emailHtmlHasRemoteContent` so the prompt matches what gets blocked. */
export function resolveReaderRemoteContent(input: {
  settings: Pick<MailDisplaySettings, "externalContentPolicy" | "trustedSenders">;
  hasRemoteContent: boolean;
  senderEmail?: string | null;
  loadedForMessage: boolean;
}): {
  blockRemoteImages: boolean;
  prompt: { canLoadOnce: boolean; canTrustSender: boolean } | null;
} {
  const policy = input.settings.externalContentPolicy;
  const blockRemoteImages = shouldBlockRemoteImages({
    policy,
    allowExternalContent: input.loadedForMessage,
    senderEmail: input.senderEmail,
    trustedSenders: input.settings.trustedSenders,
  });
  return {
    blockRemoteImages,
    prompt: resolveRemoteContentPrompt({
      policy,
      blockRemoteImages,
      hasRemoteContent: input.hasRemoteContent,
      senderEmail: input.senderEmail,
    }),
  };
}

export function resolveMailContentIsDark(
  settings: Pick<MailDisplaySettings, "emailAppearance">,
): boolean {
  return settings.emailAppearance === "dark";
}
