/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  findAttachmentReminderKeyword,
  readMailComposeSettings,
  shouldWarnAboutMissingAttachment,
  writeMailComposeSettings,
} from "@/lib/mail/compose-settings";

describe("compose-settings", () => {
  describe("defaults and persistence", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("defaults attachment reminder to enabled with multilingual keywords", () => {
    expect(DEFAULT_MAIL_COMPOSE_SETTINGS.attachmentReminderEnabled).toBe(true);
    expect(DEFAULT_MAIL_COMPOSE_SETTINGS.attachmentReminderKeywords).toEqual(
      expect.arrayContaining(["attached", "attachment", "anhang", "附件"]),
    );
  });

  it("persists settings to localStorage", () => {
    writeMailComposeSettings({
      ...DEFAULT_MAIL_COMPOSE_SETTINGS,
      plainTextMode: true,
      signaturePosition: "above_quote",
    });

    expect(readMailComposeSettings()).toEqual(
      expect.objectContaining({
        plainTextMode: true,
        signaturePosition: "above_quote",
      }),
    );
  });

  it("falls back to defaults for invalid stored JSON", () => {
    localStorage.setItem("mail:composeSettings", "{not-json");
    expect(readMailComposeSettings()).toEqual(DEFAULT_MAIL_COMPOSE_SETTINGS);
  });
  });

  describe("findAttachmentReminderKeyword", () => {
    it("matches keywords case-insensitively in subject or body", () => {
      expect(
        findAttachmentReminderKeyword(
          "Files",
          "Please find ATTACHED report.",
          ["attached"],
        ),
      ).toBe("attached");
    });

    it("returns null when no keyword matches", () => {
      expect(
        findAttachmentReminderKeyword("Hello", "No files here.", ["attached"]),
      ).toBeNull();
    });
  });

  describe("shouldWarnAboutMissingAttachment", () => {
    it("warns when reminder is enabled, no files, and body mentions attachments", () => {
      expect(
        shouldWarnAboutMissingAttachment({
          enabled: true,
          attachmentCount: 0,
          subject: "Update",
          bodyText: "See attached.",
          keywords: ["attached"],
        }),
      ).toBe("attached");
    });

    it("skips when files are already attached", () => {
      expect(
        shouldWarnAboutMissingAttachment({
          enabled: true,
          attachmentCount: 1,
          subject: "Update",
          bodyText: "See attached.",
          keywords: ["attached"],
        }),
      ).toBeNull();
    });

    it("skips when reminder is disabled", () => {
      expect(
        shouldWarnAboutMissingAttachment({
          enabled: false,
          attachmentCount: 0,
          subject: "Update",
          bodyText: "See attached.",
          keywords: ["attached"],
        }),
      ).toBeNull();
    });
  });
});
