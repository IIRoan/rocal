import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  isTrustedSender,
  parseMailDisplaySettings,
  resolveMailContentIsDark,
  resolveReaderRemoteContent,
  serializeMailDisplaySettings,
  withTrustedSender,
  withoutTrustedSender,
  type MailDisplaySettings,
} from "../mail-display-settings";
import { emailHtmlHasRemoteContent } from "../mail-html";

const REMOTE_HTML = '<p>Hi</p><img src="https://tracker.example/pixel.png">';

function settings(patch: Partial<MailDisplaySettings> = {}): MailDisplaySettings {
  return { ...DEFAULT_MAIL_DISPLAY_SETTINGS, ...patch };
}

function resolveFor(input: {
  settings: MailDisplaySettings;
  html: string;
  senderEmail: string | null;
  loadedForMessage: boolean;
}) {
  return resolveReaderRemoteContent({
    settings: input.settings,
    hasRemoteContent: emailHtmlHasRemoteContent({
      html: input.html,
      isDark: false,
      blockTrackingPixels: input.settings.blockTrackingPixels,
    }),
    senderEmail: input.senderEmail,
    loadedForMessage: input.loadedForMessage,
  });
}

describe("mail display settings", () => {
  it("defaults to asking before loading remote content", () => {
    expect(DEFAULT_MAIL_DISPLAY_SETTINGS.externalContentPolicy).toBe("ask");
    expect(parseMailDisplaySettings(null).externalContentPolicy).toBe("ask");
    expect(parseMailDisplaySettings("{not json").externalContentPolicy).toBe("ask");
  });

  it("blocks remote images by default and offers both opt-ins", () => {
    const result = resolveFor({
      settings: DEFAULT_MAIL_DISPLAY_SETTINGS,
      html: REMOTE_HTML,
      senderEmail: "news@example.com",
      loadedForMessage: false,
    });
    expect(result.blockRemoteImages).toBe(true);
    expect(result.prompt).toEqual({ canLoadOnce: true, canTrustSender: true });
  });

  it("loads remote images once for a single message", () => {
    const result = resolveFor({
      settings: DEFAULT_MAIL_DISPLAY_SETTINGS,
      html: REMOTE_HTML,
      senderEmail: "news@example.com",
      loadedForMessage: true,
    });
    expect(result.blockRemoteImages).toBe(false);
    expect(result.prompt).toBeNull();
  });

  it("loads remote images automatically for trusted senders", () => {
    const trusted = withTrustedSender(DEFAULT_MAIL_DISPLAY_SETTINGS, " News@Example.com ");
    expect(trusted.trustedSenders).toEqual(["news@example.com"]);
    expect(isTrustedSender("NEWS@example.com", trusted)).toBe(true);
    const result = resolveFor({
      settings: trusted,
      html: REMOTE_HTML,
      senderEmail: "news@example.com",
      loadedForMessage: false,
    });
    expect(result.blockRemoteImages).toBe(false);
    expect(withoutTrustedSender(trusted, "news@example.com").trustedSenders).toEqual([]);
  });

  it("never loads remote images under the block policy, even for trusted senders", () => {
    const blocked = withTrustedSender(settings({ externalContentPolicy: "block" }), "a@b.co");
    const result = resolveFor({
      settings: blocked,
      html: REMOTE_HTML,
      senderEmail: "a@b.co",
      loadedForMessage: true,
    });
    expect(result.blockRemoteImages).toBe(true);
    expect(result.prompt).toEqual({ canLoadOnce: false, canTrustSender: false });
  });

  it("allows remote images without a prompt under the allow policy", () => {
    const result = resolveFor({
      settings: settings({ externalContentPolicy: "allow" }),
      html: REMOTE_HTML,
      senderEmail: "a@b.co",
      loadedForMessage: false,
    });
    expect(result).toEqual({ blockRemoteImages: false, prompt: null });
  });

  it("shows no prompt when the message has no remote content", () => {
    const result = resolveFor({
      settings: DEFAULT_MAIL_DISPLAY_SETTINGS,
      html: "<p>Plain</p>",
      senderEmail: "a@b.co",
      loadedForMessage: false,
    });
    expect(result.blockRemoteImages).toBe(true);
    expect(result.prompt).toBeNull();
  });

  it.each([
    ["double-quoted src", '<img src="https://x.example/a.png">'],
    ["single-quoted src", "<img src='https://x.example/a.png'>"],
    ["unquoted src", "<img src=https://x.example/a.png>"],
    ["protocol-relative src", '<img src="//x.example/a.png">'],
    ["upper-case src", '<IMG SRC="HTTPS://X.EXAMPLE/A.PNG">'],
    ["entity-encoded scheme", '<img src="https&#58;//x.example/a.png">'],
    ["whitespace before URL", '<img src=" https://x.example/a.png">'],
    ["src on its own line", '<img\nalt="a"\nsrc=\n"https://x.example/a.png">'],
    ["background attribute", '<table><tr><td background="https://x.example/bg.png">hi</td></tr></table>'],
    ["unquoted background", "<table background=//x.example/bg.png><tr><td>hi</td></tr></table>"],
    ["css url", '<div style="background:url(https://x.example/bg.png)">x</div>'],
    ["protocol-relative css url", '<div style="background:url(//x.example/bg.png)">x</div>'],
    ["entity-quoted css url", '<div style="background:url(&quot;https://x.example/bg.png&quot;)">x</div>'],
    ["style block url", "<style>.hero{background:url('https://x.example/bg.png')}</style>"],
    ["backslash scheme", '<img src="https:\\\\x.example/a.png">'],
  ])("prompts for remote content in a %s", (_label, html) => {
    const result = resolveFor({
      settings: DEFAULT_MAIL_DISPLAY_SETTINGS,
      html,
      senderEmail: "a@b.co",
      loadedForMessage: false,
    });
    expect(result.blockRemoteImages).toBe(true);
    expect(result.prompt).toEqual({ canLoadOnce: true, canTrustSender: true });
  });

  it.each([
    ["inline cid image", '<img src="cid:logo@x">'],
    ["data image", '<img src="data:image/png;base64,AAAA">'],
    ["link only", '<a href="https://x.example">site</a>'],
    ["data-src attribute", '<img data-src="https://x.example/a.png">'],
    ["url in text", "<p>See https://x.example/a.png or url(https://x.example)</p>"],
    ["url inside an attribute value", '<img alt="src=https://x.example/a.png" src="cid:a@x">'],
    ["script the sanitizer drops", '<script src="https://x.example/a.js"></script><p>Hi</p>'],
    ["remote stylesheet import", '<style>@import "https://x.example/a.css";</style>'],
    ["srcset the sanitizer drops", '<img src="cid:a@x" srcset="https://x.example/a@2x.png 2x">'],
    ["tracking pixel that gets stripped", '<img src="https://x.example/p.gif" width="1" height="1">'],
  ])("does not prompt for a %s", (_label, html) => {
    const result = resolveFor({
      settings: DEFAULT_MAIL_DISPLAY_SETTINGS,
      html,
      senderEmail: "a@b.co",
      loadedForMessage: false,
    });
    expect(result.prompt).toBeNull();
  });

  it("does not offer trust without a sender address", () => {
    const result = resolveFor({
      settings: DEFAULT_MAIL_DISPLAY_SETTINGS,
      html: REMOTE_HTML,
      senderEmail: null,
      loadedForMessage: false,
    });
    expect(result.prompt).toEqual({ canLoadOnce: true, canTrustSender: false });
  });

  it("migrates legacy values and round-trips stored settings", () => {
    expect(parseMailDisplaySettings(null, { blockRemoteImages: "true" }).externalContentPolicy).toBe(
      "block",
    );
    expect(parseMailDisplaySettings(null, { blockRemoteImages: "false" }).externalContentPolicy).toBe(
      "ask",
    );
    expect(parseMailDisplaySettings(JSON.stringify({ emailAlwaysLightMode: true })).emailAppearance).toBe(
      "light",
    );
    const stored = settings({
      externalContentPolicy: "allow",
      emailAppearance: "original",
      trustedSenders: ["a@b.co"],
      blockTrackingPixels: false,
    });
    expect(parseMailDisplaySettings(serializeMailDisplaySettings(stored))).toEqual(stored);
  });

  it("drops invalid and duplicate trusted senders", () => {
    const parsed = parseMailDisplaySettings(
      JSON.stringify({ trustedSenders: ["A@b.co", "a@b.co", 3, ""] }),
    );
    expect(parsed.trustedSenders).toEqual(["a@b.co"]);
  });

  it("adapts colors only for the dark appearance", () => {
    expect(resolveMailContentIsDark({ emailAppearance: "dark" })).toBe(true);
    expect(resolveMailContentIsDark({ emailAppearance: "light" })).toBe(false);
    expect(resolveMailContentIsDark({ emailAppearance: "original" })).toBe(false);
  });
});
