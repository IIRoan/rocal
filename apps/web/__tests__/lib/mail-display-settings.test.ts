import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  readMailDisplaySettings,
  shouldBlockRemoteImages,
  isTrustedSender,
  addTrustedSender,
  removeTrustedSender,
  htmlContainsRemoteResources,
  resolveMailContentIsDark,
} from "@/lib/mail/mail-display-settings";

describe("mail-display-settings", () => {
  it("defaults to allow remote content and dark email appearance", () => {
    expect(DEFAULT_MAIL_DISPLAY_SETTINGS.externalContentPolicy).toBe("allow");
    expect(DEFAULT_MAIL_DISPLAY_SETTINGS.emailAppearance).toBe("dark");
    expect(DEFAULT_MAIL_DISPLAY_SETTINGS.hideInlineImageAttachments).toBe(true);
  });

  it("blocks remote images for ask policy until explicitly allowed", () => {
    expect(
      shouldBlockRemoteImages({
        policy: "ask",
        allowExternalContent: false,
        senderEmail: "alice@example.com",
        trustedSenders: [],
      }),
    ).toBe(true);
    expect(
      shouldBlockRemoteImages({
        policy: "ask",
        allowExternalContent: true,
        senderEmail: "alice@example.com",
        trustedSenders: [],
      }),
    ).toBe(false);
  });

  it("allows trusted senders to bypass ask policy", () => {
    const settings = addTrustedSender("Alice@Example.com");
    expect(isTrustedSender("alice@example.com", settings)).toBe(true);
    expect(
      shouldBlockRemoteImages({
        policy: "ask",
        allowExternalContent: false,
        senderEmail: "alice@example.com",
        trustedSenders: settings.trustedSenders,
      }),
    ).toBe(false);
  });

  it("detects remote resources in html", () => {
    expect(
      htmlContainsRemoteResources('<img src="https://example.com/a.png">'),
    ).toBe(true);
    expect(htmlContainsRemoteResources("<p>Hello</p>")).toBe(false);
    expect(htmlContainsRemoteResources('<img src="cid:img@x">')).toBe(false);
  });

  it("resolves dark rendering only for dark appearance", () => {
    expect(resolveMailContentIsDark({ emailAppearance: "dark" })).toBe(true);
    expect(resolveMailContentIsDark({ emailAppearance: "light" })).toBe(false);
    expect(resolveMailContentIsDark({ emailAppearance: "original" })).toBe(
      false,
    );
  });

  it("always blocks remote images when policy is block", () => {
    expect(
      shouldBlockRemoteImages({
        policy: "block",
        allowExternalContent: true,
        senderEmail: "alice@example.com",
        trustedSenders: ["alice@example.com"],
      }),
    ).toBe(true);
  });

  it("deduplicates trusted senders when adding", () => {
    addTrustedSender("alice@example.com");
    const again = addTrustedSender("Alice@Example.com");
    expect(again.trustedSenders).toEqual(["alice@example.com"]);
  });

  it("removes trusted senders case-insensitively", () => {
    addTrustedSender("alice@example.com");
    const next = removeTrustedSender("Alice@Example.com");
    expect(next.trustedSenders).toEqual([]);
    expect(isTrustedSender("alice@example.com", next)).toBe(false);
  });

  it("reads persisted settings from storage", () => {
    const stored = readMailDisplaySettings();
    expect(stored.externalContentPolicy).toMatch(/^(ask|block|allow)$/);
    expect(stored.emailAppearance).toMatch(/^(light|dark|original)$/);
    expect(typeof stored.blockTrackingPixels).toBe("boolean");
  });
});
