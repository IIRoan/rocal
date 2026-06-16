import { describe, expect, it } from "@jest/globals";
import { buildOutgoingMimeMessage } from "../../src/outgoing-mime";

describe("buildOutgoingMimeMessage", () => {
  it("wraps plain text in a single text/plain part", () => {
    const mime = buildOutgoingMimeMessage({
      text: "Hello\nWorld",
    });

    expect(mime).toContain("Content-Type: text/plain; charset=utf-8");
    expect(mime).toContain("Hello\r\nWorld");
  });

  it("builds multipart/mixed with text and attachments", () => {
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
    expect(mime).toContain("See attached");
    expect(mime).toContain('filename="note.txt"');
    expect(mime).toContain("Content-Transfer-Encoding: base64");
  });
});
