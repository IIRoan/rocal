export type MailSignaturePosition = "above_quote" | "below_quote";

export type MailComposeSettings = {
  plainTextMode: boolean;
  attachmentReminderEnabled: boolean;
  attachmentReminderKeywords: string[];
  signaturePosition: MailSignaturePosition;
  signatureSeparatorEnabled: boolean;
  autoSelectReplyIdentity: boolean;
};

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

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeMailComposeSettings(input: unknown): MailComposeSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return DEFAULT_MAIL_COMPOSE_SETTINGS;
  }
  const parsed = input as Record<string, unknown>;
  return {
    plainTextMode: booleanOr(parsed.plainTextMode, DEFAULT_MAIL_COMPOSE_SETTINGS.plainTextMode),
    attachmentReminderEnabled: booleanOr(
      parsed.attachmentReminderEnabled,
      DEFAULT_MAIL_COMPOSE_SETTINGS.attachmentReminderEnabled,
    ),
    attachmentReminderKeywords: Array.isArray(parsed.attachmentReminderKeywords)
      ? parsed.attachmentReminderKeywords.filter(
          (keyword): keyword is string => typeof keyword === "string",
        )
      : DEFAULT_MAIL_COMPOSE_SETTINGS.attachmentReminderKeywords,
    signaturePosition:
      parsed.signaturePosition === "below_quote" ? "below_quote" : "above_quote",
    signatureSeparatorEnabled: booleanOr(
      parsed.signatureSeparatorEnabled,
      DEFAULT_MAIL_COMPOSE_SETTINGS.signatureSeparatorEnabled,
    ),
    autoSelectReplyIdentity: booleanOr(
      parsed.autoSelectReplyIdentity,
      DEFAULT_MAIL_COMPOSE_SETTINGS.autoSelectReplyIdentity,
    ),
  };
}

export function parseMailComposeSettings(raw: string | null | undefined): MailComposeSettings {
  if (!raw) return DEFAULT_MAIL_COMPOSE_SETTINGS;
  try {
    return normalizeMailComposeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_MAIL_COMPOSE_SETTINGS;
  }
}

export function serializeMailComposeSettings(settings: MailComposeSettings): string {
  return JSON.stringify(settings);
}

/** Adds a lowercase keyword unless it is blank or already listed. */
export function addAttachmentReminderKeyword(keywords: readonly string[], keyword: string): string[] {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed || keywords.includes(trimmed)) return [...keywords];
  return [...keywords, trimmed];
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
