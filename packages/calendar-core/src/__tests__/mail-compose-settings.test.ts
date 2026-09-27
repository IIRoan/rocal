import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  addAttachmentReminderKeyword,
  parseMailComposeSettings,
  serializeMailComposeSettings,
  shouldWarnAboutMissingAttachment,
} from "../mail-compose-settings";

describe("mail compose settings", () => {
  it("falls back to defaults for missing or corrupt storage", () => {
    expect(parseMailComposeSettings(null)).toEqual(DEFAULT_MAIL_COMPOSE_SETTINGS);
    expect(parseMailComposeSettings("[]")).toEqual(DEFAULT_MAIL_COMPOSE_SETTINGS);
    expect(parseMailComposeSettings("{bad")).toEqual(DEFAULT_MAIL_COMPOSE_SETTINGS);
  });

  it("round-trips stored settings and filters invalid keywords", () => {
    const stored = {
      ...DEFAULT_MAIL_COMPOSE_SETTINGS,
      plainTextMode: true,
      signaturePosition: "above_quote" as const,
      attachmentReminderKeywords: ["enclosed"],
    };
    expect(parseMailComposeSettings(serializeMailComposeSettings(stored))).toEqual(stored);
    expect(
      parseMailComposeSettings(JSON.stringify({ attachmentReminderKeywords: ["ok", 1] }))
        .attachmentReminderKeywords,
    ).toEqual(["ok"]);
  });

  it("adds lowercase keywords once", () => {
    expect(addAttachmentReminderKeyword(["attached"], " Enclosed ")).toEqual([
      "attached",
      "enclosed",
    ]);
    expect(addAttachmentReminderKeyword(["attached"], "ATTACHED")).toEqual(["attached"]);
    expect(addAttachmentReminderKeyword(["attached"], "  ")).toEqual(["attached"]);
  });

  it("warns when a keyword is mentioned without attachments", () => {
    const base = {
      enabled: true,
      attachmentCount: 0,
      subject: "Report",
      bodyText: "Please find the file Attached.",
      keywords: DEFAULT_MAIL_COMPOSE_SETTINGS.attachmentReminderKeywords,
    };
    expect(shouldWarnAboutMissingAttachment(base)).toBe("attached");
    expect(shouldWarnAboutMissingAttachment({ ...base, attachmentCount: 1 })).toBeNull();
    expect(shouldWarnAboutMissingAttachment({ ...base, enabled: false })).toBeNull();
    expect(shouldWarnAboutMissingAttachment({ ...base, bodyText: "No files here" })).toBeNull();
  });
});
