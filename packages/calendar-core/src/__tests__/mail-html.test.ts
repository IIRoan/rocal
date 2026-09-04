import { describe, expect, it } from "@jest/globals";
import {
  buildEmailHtmlDocument,
  EMAIL_AUTO_DARK_CSS,
  processEmailHtml,
} from "../mail-html";

describe("buildEmailHtmlDocument", () => {
  it("includes rich text styles for lists, links, and quotes", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<p>Hello</p>",
      isDark: false,
      blockRemoteImages: false,
      hasOwnDark: false,
    });

    expect(doc).toContain("list-style-type:disc");
    expect(doc).toContain("list-style-type:decimal");
    expect(doc).toContain("text-decoration:underline");
    expect(doc).toContain("text-decoration:line-through");
    expect(doc).toContain("border-left:3px solid");
  });

  it("renders list markup in the email body", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<ul><li>one</li><li>two</li></ul>",
      isDark: false,
      blockRemoteImages: false,
      hasOwnDark: false,
    });

    expect(doc).toContain("<ul><li>one</li><li>two</li></ul>");
  });

  it("avoids body word-break that crushes table column min-content width", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<table><tr><th>Qty</th><th>Total</th></tr></table>",
      isDark: false,
      blockRemoteImages: false,
      hasOwnDark: false,
    });

    expect(doc).toMatch(/body\{[^}]*overflow-wrap:break-word/);
    expect(doc).not.toMatch(/body\{[^}]*overflow-wrap:anywhere/);
    expect(doc).not.toMatch(/body\{[^}]*word-break:break-word/);
    expect(doc).toContain("td,th{overflow-wrap:break-word;word-break:normal}");
    expect(doc).toContain("pre{white-space:pre-wrap");
  });

  it("injects auto-dark styles that remap background: tint cards", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: `<td style="background:#e8f0fe;color:#202124">Mail</td>`,
      isDark: true,
      blockRemoteImages: false,
      hasOwnDark: false,
    });

    expect(doc).toContain(EMAIL_AUTO_DARK_CSS);
    expect(EMAIL_AUTO_DARK_CSS).toContain('[style*="background:#e8f0fe"]');
    expect(EMAIL_AUTO_DARK_CSS).toContain('[style*="color: #1a1410"]');
    expect(EMAIL_AUTO_DARK_CSS).toContain('[style*="color: #444"]');
    expect(EMAIL_AUTO_DARK_CSS).toContain("pre, code");
    expect(EMAIL_AUTO_DARK_CSS).not.toContain("background-color: inherit");
  });

  it("locks mobile viewport zoom so the native scroller can own pinch-zoom", () => {
    const doc = buildEmailHtmlDocument({
      processedHtml: "<p>Hello</p>",
      isDark: false,
      blockRemoteImages: false,
      hasOwnDark: false,
      mobileViewport: true,
    });

    expect(doc).toContain(
      'content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"',
    );
  });
});

describe("processEmailHtml", () => {
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
