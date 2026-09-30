import { describe, expect, it } from "@jest/globals";
import {
  buildEmailContentSecurityPolicy,
  buildEmailHtmlDocument,
  darkenCssColor,
  darkenTextColor,
  processEmailHtml,
} from "../mail-html";

describe("buildEmailHtmlDocument", () => {
  it("includes rich text styles for lists, links, and quotes", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<p>Hello</p>",
      isDark: false,
      blockRemoteImages: false,
    });

    expect(doc).toContain("list-style-type:disc");
    expect(doc).toContain("list-style-type:decimal");
    expect(doc).toContain("text-decoration:underline");
    expect(doc).toContain("text-decoration:line-through");
    expect(doc).toContain("border-left:3px solid");
  });

  it("keeps page padding by default and drops it when flush is set", () => {
    const options = { processedHtml: "<p>Hello</p>", isDark: false, blockRemoteImages: false };

    expect(buildEmailHtmlDocument(options)).toContain("padding:16px 20px;");
    expect(buildEmailHtmlDocument({ ...options, flush: true })).toContain("padding:0;");
  });

  it("renders list markup in the email body", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<ul><li>one</li><li>two</li></ul>",
      isDark: false,
      blockRemoteImages: false,
    });

    expect(doc).toContain("<ul><li>one</li><li>two</li></ul>");
  });

  it("avoids body word-break that crushes table column min-content width", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<table><tr><th>Qty</th><th>Total</th></tr></table>",
      isDark: false,
      blockRemoteImages: false,
    });

    expect(doc).toMatch(/body\{[^}]*overflow-wrap:break-word/);
    expect(doc).not.toMatch(/body\{[^}]*overflow-wrap:anywhere/);
    expect(doc).not.toMatch(/body\{[^}]*word-break:break-word/);
    expect(doc).toContain("td,th{overflow-wrap:break-word;word-break:normal}");
    expect(doc).toContain("pre{white-space:pre-wrap");
  });

  it("locks mobile viewport zoom so the native scroller can own pinch-zoom", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<p>Hello</p>",
      isDark: false,
      blockRemoteImages: false,
      mobileViewport: true,
    });

    expect(doc).toContain(
      'content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"',
    );
  });
});

/** WCAG 2 contrast ratio between two #rrggbb colors. */
function contrast(first: string, second: string): number {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = (hex.slice(1).match(/../g) ?? []).map((pair) => {
      const value = Number.parseInt(pair, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

const grayHex = (value: number) => `#${value.toString(16).padStart(2, "0").repeat(3)}`;

/** Trimmed from a real Gmail-forwarded ChatGPT newsletter: inline styles, bgcolor, a white logo plate, black pill buttons, gray footer. */
const NEWSLETTER_HTML = `<div dir="ltr"><div class="gmail_quote"><div dir="ltr" bgcolor="#FFFFFF" style="background-color:#ffffff">
<div style="display:none;color:#fff;opacity:0">Fresh ways to create.</div>
<table width="100%" bgcolor="#FFFFFF" style="background-color:#ffffff"><tbody><tr><td align="center">
<a href="https://example.com/home" style="display:inline-block;background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border-radius:12px;padding:4px"><img alt="" src="cid:logo" width="103" style="display:block;background-color:#ffffff;border-radius:10px"></a>
<h1 style="margin:0;color:#0d0d0d;font-family:&#39;OpenAI Sans&#39;,Helvetica,Arial,sans-serif;font-size:30px">We’ve been busy. Here’s what’s new.</h1>
<p style="margin:0;color:#0d0d0d">From bringing your imagination to life.</p>
<a href="https://example.com/try" style="background-color:#000000;padding:12px 24px;color:#ffffff;border:1px solid #000000;border-radius:24px">Try Images</a>
<table bgcolor="#FFFFFF" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px"><tbody><tr><td style="padding:16px">
<h2 style="color:#0d0d0d">New photo. Wrong decade.</h2><p style="color:#191919">Try big ’80s hair.</p>
</td></tr></tbody></table>
<a href="https://example.com/useful" style="background-color:#f3f3f3;border:1px solid #ffffff;color:#0d0d0d">Useful</a>
<table><tbody><tr><td style="background-color:#ededed;border-radius:12px;padding:24px">
<span style="font-size:10px;color:#000">OpenAI</span> <a href="https://example.com/unsubscribe" style="color:#898a8d">Unsubscribe</a>
</td></tr></tbody></table>
</td></tr></tbody></table></div></div></div>`;

function renderNewsletter(isDark: boolean): string {
  return processEmailHtml({ html: NEWSLETTER_HTML, isDark, blockTrackingPixels: false });
}

describe("darkenCssColor", () => {
  it("maps white onto the dark canvas and black onto the dark text color", () => {
    expect(darkenCssColor("#ffffff")).toBe("#1a1a1a");
    expect(darkenCssColor("#FFF")).toBe("#1a1a1a");
    expect(darkenCssColor("white")).toBe("#1a1a1a");
    expect(darkenCssColor("rgb(255, 255, 255)")).toBe("#1a1a1a");
    expect(darkenCssColor("#000000")).toBe("#e0e0e0");
    expect(darkenCssColor("black")).toBe("#e0e0e0");
    expect(darkenCssColor("windowtext")).toBe("#e0e0e0");
  });

  it("keeps alpha", () => {
    expect(darkenCssColor("rgba(0, 0, 0, 0.5)")).toBe("rgba(224, 224, 224, 0.5)");
    expect(darkenCssColor("#ffffff80")).toBe("rgba(26, 26, 26, 0.502)");
  });

  it.each(["currentColor", "inherit", "transparent", "hsl(0 0% 100%)", "red"])(
    "leaves %s untouched",
    (token) => {
      expect(darkenCssColor(token)).toBe(token);
    },
  );

  it("reverses lightness order across the gray ramp, so no fg/bg pair can swap into dark-on-dark", () => {
    const darkened = Array.from({ length: 52 }, (_, index) => darkenCssColor(grayHex(index * 5)));
    for (let index = 1; index < darkened.length; index += 1) {
      expect(Number.parseInt(darkened[index]!.slice(1, 3), 16)).toBeLessThanOrEqual(
        Number.parseInt(darkened[index - 1]!.slice(1, 3), 16),
      );
    }
  });

  it("keeps hue for brand colors", () => {
    const [r = 0, g = 0, b = 0] = (darkenCssColor("#e8f0fe").slice(1).match(/../g) ?? []).map(
      (pair) => Number.parseInt(pair, 16),
    );
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it.each([
    ["headline", "#0d0d0d", "#ffffff"],
    ["card body", "#191919", "#ffffff"],
    ["pill button", "#ffffff", "#000000"],
    ["feedback chip", "#0d0d0d", "#f3f3f3"],
    ["footer", "#000000", "#ededed"],
  ])("keeps the %s at AAA contrast", (_label, foreground, background) => {
    expect(contrast(darkenTextColor(foreground, background), darkenCssColor(background))).toBeGreaterThanOrEqual(7);
  });

  it.each([
    ["blue link", "#1a73e8", "#ffffff"],
    ["muted footer link", "#898a8d", "#ededed"],
    ["white on a saturated button", "#ffffff", "#ff5a00"],
    ["pale text on white", "#dddddd", "#ffffff"],
  ])("lifts %s to at least AA contrast where plain inversion falls short", (_label, foreground, background) => {
    expect(contrast(darkenTextColor(foreground, background), darkenCssColor(background))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("processEmailHtml dark translation", () => {
  it("translates a designed newsletter instead of leaving black text on the dark canvas", () => {
    const processed = renderNewsletter(true);
    const withoutImages = processed.replace(/<img\b[^>]*>/gi, "");

    expect(withoutImages).not.toMatch(/#fff(?:fff)?\b|#ededed|#f3f3f3|#0d0d0d|#191919|#000(?:000)?\b/i);
    expect(processed).toContain(`color:${darkenTextColor("#0d0d0d")}`);
    expect(processed).toContain(`color:${darkenTextColor("#ffffff", "#000000")}`);
    expect(processed).toContain(`background-color:${darkenCssColor("#000000")}`);
    expect(processed).toContain(`bgcolor="${darkenCssColor("#FFFFFF")}"`);
    expect(processed).toContain(`linear-gradient(${darkenCssColor("#ffffff")},${darkenCssColor("#ffffff")})`);
    expect(processed).toContain(`border:1px solid ${darkenCssColor("#e5e7eb")}`);
    expect(processed).toContain("font-family:&#39;OpenAI Sans&#39;,Helvetica,Arial,sans-serif");
  });

  it("translates text against the background it inherits from an ancestor", () => {
    const processed = processEmailHtml({
      html: `<table><tr><td style="background-color:#ff5a00"><p><span style="color:#ffffff">Sale</span></p></td></tr></table><p style="color:#ffffff">Outside</p>`,
      isDark: true,
      blockTrackingPixels: false,
    });

    expect(processed).toContain(`color:${darkenTextColor("#ffffff", "#ff5a00")}`);
    expect(processed).toContain(`color:${darkenTextColor("#ffffff", "#ffffff")}`);
    expect(darkenTextColor("#ffffff", "#ff5a00")).not.toBe(darkenTextColor("#ffffff", "#ffffff"));
  });

  it("keeps image plates as sent so dark logos stay visible", () => {
    expect(renderNewsletter(true)).toMatch(/<img[^>]*background-color:#ffffff/);
  });

  it("translates class colors in style blocks and leaves url() values alone", () => {
    const processed = processEmailHtml({
      html: `<html><head><style>.h{color:#0d0d0d;background:url(cid:white-bg) #ffffff}</style></head><body><h1 class="h">Hi</h1></body></html>`,
      isDark: true,
      blockTrackingPixels: false,
    });

    expect(processed).toContain(`.h{color:${darkenTextColor("#0d0d0d")};background:url(cid:white-bg) #1a1a1a}`);
  });

  it("translates white onto a custom canvas and paints the page with it", () => {
    const options = { isDark: true, canvasColor: "#1f1f1f" };
    const processed = processEmailHtml({
      ...options,
      html: `<p style="background:#ffffff">Hi</p>`,
      blockTrackingPixels: false,
    });
    const doc = buildEmailHtmlDocument({ ...options, processedHtml: processed, blockRemoteImages: false });

    expect(processed).toContain("background:#1f1f1f");
    expect(doc).toContain("body{background:#1f1f1f;");
  });

  it("translates legacy font colors", () => {
    const processed = processEmailHtml({
      html: `<font color="#333333">Hi</font>`,
      isDark: true,
      blockTrackingPixels: false,
    });

    expect(processed).toContain(`color="${darkenTextColor("#333333")}"`);
  });

  it("leaves mail with its own dark styles to those styles", () => {
    const html = `<style>.t{color:#000}@media (prefers-color-scheme: dark){.t{color:#fff}}</style><p class="t" style="background:#ffffff">Hi</p>`;
    const processed = processEmailHtml({ html, isDark: true, blockTrackingPixels: false });

    expect(processed).toContain(".t{color:#000}");
    expect(processed).toContain("background:#ffffff");
  });

  it("leaves colors as sent in light mode", () => {
    expect(renderNewsletter(false)).toContain("color:#0d0d0d");
    expect(renderNewsletter(false)).toContain('bgcolor="#FFFFFF"');
  });
});

describe("email document CSP", () => {
  const cspOf = (doc: string) =>
    doc.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1] ?? null;

  it.each([true, false])("always emits a script-free CSP (blockRemoteImages=%s)", (blockRemoteImages) => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<p>Hello</p>",
      isDark: false,
      blockRemoteImages,
    });
    const csp = cspOf(doc);

    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain("font-src data:");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<style>"));
    expect(doc).toContain('<meta name="referrer" content="no-referrer">');
  });

  it("allows remote images only when the user opted in", () => {
    expect(buildEmailContentSecurityPolicy(false)).toContain("img-src data: blob: cid:;");
    expect(buildEmailContentSecurityPolicy(false)).not.toContain("https:");
    expect(buildEmailContentSecurityPolicy(true)).toContain("img-src data: blob: cid: https: http:;");
  });
});

describe("processEmailHtml", () => {
  it("always sanitizes while keeping head styles for the reader", () => {
    const processed = processEmailHtml({
      html: `<html><head><style>.a{color:red}</style><meta http-equiv="refresh" content="0;url=https://e.test"></head><body><p class="a" onclick="alert(1)">Hi</p><script>alert(2)</script><a href="javascript:alert(3)">x</a><form action="https://e.test"><input name="p"></form></body></html>`,
      isDark: false,
      blockTrackingPixels: false,
    });

    expect(processed).toContain("<style>.a{color:red}</style>");
    expect(processed).toContain('<p class="a">Hi</p>');
    expect(processed).not.toMatch(/onclick|<script|javascript:|<form|<input|refresh/i);
  });

  it("strips remote images when remote content is blocked", () => {
    const processed = processEmailHtml({
      html: `<img src="https://example.com/banner.png"><img src="cid:logo@x">`,
      isDark: false,
      blockTrackingPixels: false,
      blockRemoteImages: true,
    });

    expect(processed).not.toContain("banner.png");
    expect(processed).toContain("cid:logo@x");
  });

  it("strips the mail's own dark styles in light mode, including media type prefixes", () => {
    const processed = processEmailHtml({
      html: `<style>.t{color:#000}@media screen and (prefers-color-scheme: dark){.t{color:#fff}}</style><p class="t">Hi</p>`,
      isDark: false,
      blockTrackingPixels: false,
    });

    expect(processed).toContain(".t{color:#000}");
    expect(processed).not.toContain("prefers-color-scheme");
  });

  it("keeps the mail's own dark styles in dark mode", () => {
    const processed = processEmailHtml({
      html: `<style>@media (prefers-color-scheme: dark){.t{color:#fff}}</style><p class="t">Hi</p>`,
      isDark: true,
      blockTrackingPixels: false,
    });

    expect(processed).toContain("prefers-color-scheme: dark");
  });

  it("strips 1x1 tracking pixels when enabled", () => {
    const html = `<p>Hi</p><img src="https://example.com/p.gif" width="1" height="1" /><img src="https://example.com/banner.png" width="640" height="200" />`;
    const processed = processEmailHtml({
      html,
      isDark: true,
      blockTrackingPixels: true,
    });

    expect(processed).not.toContain("p.gif");
    expect(processed).toContain("banner.png");
  });
});
