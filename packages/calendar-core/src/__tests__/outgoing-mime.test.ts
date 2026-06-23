import { describe, expect, it } from "@jest/globals";
import {
  buildOutgoingMimeMessage,
  looksLikeMimeMessage,
} from "../../src/outgoing-mime";

describe("looksLikeMimeMessage", () => {
  it("detects MIME envelopes by Content-Type header", () => {
    expect(
      looksLikeMimeMessage(
        "Content-Type: multipart/alternative; boundary=\"alt\"\r\n\r\nbody",
      ),
    ).toBe(true);
    expect(looksLikeMimeMessage("Hello plain text")).toBe(false);
  });
});

describe("buildOutgoingMimeMessage", () => {
  it("wraps plain text in a single text/plain part", () => {
    const mime = buildOutgoingMimeMessage({
      text: "Hello\nWorld",
    });

    expect(mime).toContain("Content-Type: text/plain; charset=utf-8");
    expect(mime).toContain("Hello\r\nWorld");
    expect(mime).not.toContain("multipart/alternative");
  });

  it("wraps rich text in multipart/alternative with text and html parts", () => {
    const mime = buildOutgoingMimeMessage({
      text: "Hello world",
      html: "<p>Hello <strong>world</strong></p>",
    });

    expect(mime).toContain("Content-Type: multipart/alternative; boundary=\"");
    expect(mime).toContain("Content-Type: text/plain; charset=utf-8");
    expect(mime).toContain("Content-Type: text/html; charset=utf-8");
    expect(mime).toContain("Hello world");
    expect(mime).toContain("<p>Hello <strong>world</strong></p>");
  });

  it("builds multipart/mixed with html body and attachments", () => {
    const mime = buildOutgoingMimeMessage({
      text: "See attached",
      html: "<p>See <em>attached</em></p>",
      attachments: [
        {
          filename: "note.txt",
          contentType: "text/plain",
          content: new TextEncoder().encode("attachment body"),
        },
      ],
    });

    expect(mime).toContain('Content-Type: multipart/mixed; boundary="');
    expect(mime).toContain("Content-Type: multipart/alternative; boundary=\"");
    expect(mime).toContain("See attached");
    expect(mime).toContain("<p>See <em>attached</em></p>");
    expect(mime).toContain('filename="note.txt"');
    expect(mime).toContain("Content-Transfer-Encoding: base64");
  });

  it("builds multipart/mixed with text and attachments when html is absent", () => {
    const mime = buildOutgoingMimeMessage({
      text: "See attached",
      attachments: [
        {
          filename: "note.txt",
          contentType: "text/plain",
          content: new TextEncoder().encode("attachment body"),
        },
      ],
    });

    expect(mime).toContain('Content-Type: multipart/mixed; boundary="');
    expect(mime).not.toContain("multipart/alternative");
    expect(mime).toContain("See attached");
    expect(mime).toContain('filename="note.txt"');
  });
});
