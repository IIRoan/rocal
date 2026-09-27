/** @jest-environment jsdom */

import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  readMailDisplaySettings,
  shouldBlockRemoteImages,
  isTrustedSender,
  addTrustedSender,
  removeTrustedSender,
  resolveMailContentIsDark,
  resolveReaderRemoteContent,
} from "@/lib/mail/mail-display-settings";
import { emailHtmlHasRemoteContent } from "@workspace/calendar-core/mail-html";

describe("mail-display-settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to asking before remote content and dark email appearance", () => {
    expect(DEFAULT_MAIL_DISPLAY_SETTINGS.externalContentPolicy).toBe("ask");
    expect(DEFAULT_MAIL_DISPLAY_SETTINGS.emailAppearance).toBe("dark");
    expect(DEFAULT_MAIL_DISPLAY_SETTINGS.hideInlineImageAttachments).toBe(true);
  });

  it("blocks remote images when nothing is stored", () => {
    const settings = readMailDisplaySettings();
    expect(settings.externalContentPolicy).toBe("ask");
    expect(
      shouldBlockRemoteImages({
        policy: settings.externalContentPolicy,
        allowExternalContent: false,
        senderEmail: "alice@example.com",
        trustedSenders: settings.trustedSenders,
      }),
    ).toBe(true);
  });

  it("keeps an explicitly stored allow policy", () => {
    localStorage.setItem(
      "mail:displaySettings",
      JSON.stringify({ externalContentPolicy: "allow" }),
    );
    expect(readMailDisplaySettings().externalContentPolicy).toBe("allow");
  });

  it("migrates the legacy block-remote-images flag", () => {
    localStorage.setItem("mail:blockRemoteImages", "true");
    expect(readMailDisplaySettings().externalContentPolicy).toBe("block");
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

  it.each([
    ["unquoted src", "<img src=https://example.com/a.png>"],
    ["protocol-relative src", '<img src="//example.com/a.png">'],
    ["entity-encoded scheme", '<img src="https&#58;//example.com/a.png">'],
    [
      "table background",
      '<table><tr><td background="https://example.com/bg.png">Hi</td></tr></table>',
    ],
    [
      "entity-quoted css url",
      '<div style="background-image:url(&quot;https://example.com/bg.png&quot;)">Hi</div>',
    ],
  ])("offers to load remote content in a %s", (_label, html) => {
    const hasRemoteContent = emailHtmlHasRemoteContent({
      html,
      isDark: false,
      blockTrackingPixels: true,
    });
    expect(
      resolveReaderRemoteContent({
        settings: DEFAULT_MAIL_DISPLAY_SETTINGS,
        hasRemoteContent,
        senderEmail: "alice@example.com",
        loadedForMessage: false,
      }).prompt,
    ).toEqual({ canLoadOnce: true, canTrustSender: true });
  });

  it.each([
    ["plain text", "<p>Hello</p>"],
    ["inline cid image", '<img src="cid:img@x">'],
    ["tracking pixel", '<img src="https://example.com/p.gif" width="1" height="1">'],
  ])("does not prompt for a %s", (_label, html) => {
    expect(
      emailHtmlHasRemoteContent({ html, isDark: false, blockTrackingPixels: true }),
    ).toBe(false);
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
