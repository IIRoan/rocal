/** @jest-environment jsdom */

import { describe, expect, it } from "@jest/globals";
import {
  getPlainTextSignature,
  hasComposeHtmlBody,
  htmlToPlainText,
  resolveOutgoingComposeBodies,
  sanitizeSignatureHtml,
  buildEmbeddedSignatureHtml,
} from "@workspace/calendar-core";
import { insertEmbeddedSignatureHtml, swapEmbeddedSignatureInHtml } from "@workspace/mail-editor";

describe("signature-utils", () => {
  it("prefers text signatures over html signatures for plain text", () => {
    expect(
      getPlainTextSignature({
        textSignature: "Alice",
        htmlSignature: "<p>Bob</p>",
      }),
    ).toBe("Alice");
  });

  it("falls back to html signature text when no text signature exists", () => {
    expect(
      getPlainTextSignature({
        htmlSignature: "<p>Line one</p><p>Line two</p>",
      }),
    ).toBe("Line one\nLine two");
  });

  it("converts html to plain text", () => {
    expect(htmlToPlainText("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });

  it("detects compose html bodies with any visible text", () => {
    expect(hasComposeHtmlBody("<p>Hello</p>")).toBe(true);
    expect(hasComposeHtmlBody("<p>Hello <strong>world</strong></p>")).toBe(
      true,
    );
    expect(hasComposeHtmlBody("<p><s>strike</s></p>")).toBe(true);
    expect(hasComposeHtmlBody("")).toBe(false);
    expect(hasComposeHtmlBody("<p></p>")).toBe(false);
  });

  it("resolves outgoing compose bodies with html and plain alternatives", () => {
    expect(
      resolveOutgoingComposeBodies({
        body: "",
        htmlBody: "<p>Hello <strong>world</strong></p>",
      }),
    ).toEqual({
      textBody: "Hello world",
      htmlBody: "<p>Hello <strong>world</strong></p>",
    });
  });

  it("falls back to plain body when html is empty", () => {
    expect(
      resolveOutgoingComposeBodies({
        body: "Plain only",
        htmlBody: "",
      }),
    ).toEqual({
      textBody: "Plain only",
      htmlBody: undefined,
    });
  });

  it("keeps html body for image-only compose content", () => {
    const html =
      '<p></p><img src="data:image/png;base64,abc" data-cid="img@solace">';
    expect(
      resolveOutgoingComposeBodies({
        body: "",
        htmlBody: html,
      }),
    ).toEqual({
      textBody: "",
      htmlBody: html,
    });
  });

  it("strips script tags and inline event handlers from signature HTML", () => {
    const sanitized = sanitizeSignatureHtml(
      '<p onclick="alert(1)">Hi</p><script>alert(2)</script><img src="x" onerror="alert(3)">',
    );
    expect(sanitized).toContain("Hi");
    expect(sanitized).not.toMatch(/script/i);
    expect(sanitized).not.toMatch(/onerror/i);
    expect(sanitized).not.toMatch(/onclick/i);
  });
});

describe("swapEmbeddedSignatureInHtml", () => {
  const work = { textSignature: "Alex Doe\nSolace" };
  const home = { textSignature: "Alex" };
  const block = (signature: { textSignature: string }) =>
    buildEmbeddedSignatureHtml(signature, { separator: true });
  const quote = '<blockquote><p data-signature-block="start"></p><p>Alex</p><p data-signature-block="end"></p></blockquote>';

  it("swaps or removes the block that holds a known signature", () => {
    const html = `<p>Hi</p>${block(work)}${quote}`;
    expect(swapEmbeddedSignatureInHtml(html, [work, home], home, { separator: true })).toBe(
      `<p>Hi</p>${block(home)}${quote}`,
    );
    expect(swapEmbeddedSignatureInHtml(html, [work, home], null, { separator: true })).toBe(`<p>Hi</p>${quote}`);
  });

  it("never touches an edited block, typed text after it or a signature inside the quote", () => {
    const edited = `<p>Hi</p>${block(work).replace("</p><p data-signature-block=\"end\">", "</p><p data-signature-block=\"end\">See you")}`;
    expect(swapEmbeddedSignatureInHtml(edited, [work, home], home, { separator: true })).toBeNull();
    expect(swapEmbeddedSignatureInHtml(`<p>Hi</p>${quote}`, [work, home], work, { separator: true })).toBeNull();
  });
});

describe("insertEmbeddedSignatureHtml", () => {
  const work = { textSignature: "Alex Doe\nSolace" };
  const options = { separator: true, aboveQuote: true };
  const block = buildEmbeddedSignatureHtml(work, { separator: true });
  const replyQuote = "<p>On Monday, Sam wrote:</p><div data-quoted-html=\"\"><p>Hello</p></div>";

  it("adds the signature after the empty writing line of a new message", () => {
    expect(insertEmbeddedSignatureHtml("", work, { separator: true, aboveQuote: false })).toBe(`<p></p>${block}`);
    expect(insertEmbeddedSignatureHtml("<p>Hi</p>", work, { separator: true, aboveQuote: false })).toBe(`<p>Hi</p>${block}`);
  });

  it("adds a reply or forward signature above the quote header, or after the quote below it", () => {
    expect(insertEmbeddedSignatureHtml(`<p>Thanks</p>${replyQuote}`, work, options)).toBe(`<p>Thanks</p>${block}${replyQuote}`);
    const forward = "<p>---------- Forwarded message ----------<br>From: sam@solace.test</p><div data-quoted-html=\"\"><p>Hello</p></div>";
    expect(insertEmbeddedSignatureHtml(`<p></p>${forward}`, work, options)).toBe(`<p></p>${block}${forward}`);
    expect(insertEmbeddedSignatureHtml(`<p>Thanks</p>${replyQuote}`, work, { ...options, aboveQuote: false })).toBe(`<p>Thanks</p>${replyQuote}${block}`);
  });

  it("leaves the body alone for no signature", () => {
    expect(insertEmbeddedSignatureHtml(`<p>Thanks</p>${replyQuote}`, null, options)).toBe(`<p>Thanks</p>${replyQuote}`);
  });
});
