/** @jest-environment jsdom */

import { describe, expect, it } from "@jest/globals";
import {
  appendHtmlSignature,
  appendPlainTextSignature,
  getPlainTextSignature,
  hasComposeHtmlBody,
  htmlToPlainText,
  resolveOutgoingComposeBodies,
  sanitizeSignatureHtml,
  stripTrailingPlainTextSignature,
  swapEmbeddedSignatureInPlainText,
} from "@/lib/mail/signature-utils";

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

  it("appends plain text signatures with the standard separator", () => {
    expect(
      appendPlainTextSignature("Hello", { textSignature: "Alice" }),
    ).toBe("Hello\n\n-- \nAlice");
  });

  it("seeds an empty plain text compose body with a trailing signature", () => {
    expect(appendPlainTextSignature("", { textSignature: "Alice" })).toBe(
      "\n\n-- \nAlice",
    );
  });

  it("strips trailing plain text signatures", () => {
    const body = "Hello\n\n-- \nAlice";
    expect(
      stripTrailingPlainTextSignature(body, { textSignature: "Alice" }),
    ).toBe("Hello");
    expect(
      stripTrailingPlainTextSignature("\n\n-- \nAlice", { textSignature: "Alice" }),
    ).toBe("");
  });

  it("swaps embedded plain text signatures when identity changes", () => {
    const alice = { textSignature: "Alice" };
    const bob = { textSignature: "Bob" };
    const body = "Hello\n\n-- \nAlice";
    expect(swapEmbeddedSignatureInPlainText(body, alice, bob, { separator: true })).toBe(
      "Hello\n\n-- \nBob",
    );
  });

  it("does not swap plain text signatures when the old signature was removed", () => {
    expect(
      swapEmbeddedSignatureInPlainText(
        "Hello",
        { textSignature: "Alice" },
        { textSignature: "Bob" },
        { separator: true },
      ),
    ).toBeNull();
  });

  it("appends html signatures to html bodies", () => {
    expect(
      appendHtmlSignature("<p>Hello</p>", {
        htmlSignature: "<p>Alice</p>",
      }),
    ).toBe("<p>Hello</p><br><br>-- <br><p>Alice</p>");
  });

  it("does not append a plain text signature that is already present", () => {
    const body = appendPlainTextSignature("Hello", { textSignature: "Alice" });
    expect(appendPlainTextSignature(body, { textSignature: "Alice" })).toBe(
      body,
    );
  });

  it("does not append an html signature that is already present", () => {
    const identity = { htmlSignature: "<p>Alice</p>" };
    const body = appendHtmlSignature("<p>Hello</p>", identity);
    expect(appendHtmlSignature(body, identity)).toBe(body);
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

  it("resolves outgoing compose bodies with signatures on both parts", () => {
    const identity = {
      textSignature: "Alice",
      htmlSignature: "<p>Alice</p>",
    };
    expect(
      resolveOutgoingComposeBodies({
        body: "",
        htmlBody: "<p>Hello</p>",
        signature: identity,
      }),
    ).toEqual({
      textBody: "Hello\n\n-- \nAlice",
      htmlBody: "<p>Hello</p><br><br>-- <br><p>Alice</p>",
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
