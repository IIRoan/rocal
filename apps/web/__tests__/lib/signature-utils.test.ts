/** @jest-environment jsdom */

import { describe, expect, it } from "@jest/globals";
import {
  appendHtmlSignature,
  appendPlainTextSignature,
  getPlainTextSignature,
  hasMeaningfulHtmlBody,
  htmlToPlainText,
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

  it("detects meaningful html bodies", () => {
    expect(hasMeaningfulHtmlBody("<p>Hello</p>")).toBe(false);
    expect(hasMeaningfulHtmlBody("<p>Hello <strong>world</strong></p>")).toBe(
      true,
    );
    expect(hasMeaningfulHtmlBody("")).toBe(false);
    expect(hasMeaningfulHtmlBody("<p></p>")).toBe(false);
  });
});
