import { describe, expect, it } from "@jest/globals";
import { buildOutgoingMimeMessage } from "@workspace/calendar-core";
import { parseDecryptedMailContent } from "@/lib/mail/decrypted-mail-content";

describe("parseDecryptedMailContent", () => {
  it("returns plaintext unchanged when the payload is not MIME", async () => {
    await expect(parseDecryptedMailContent("Hello plain text")).resolves.toEqual({
      text: "Hello plain text",
      html: null,
      attachments: [],
    });
  });

  it("extracts html and plain alternatives from encrypted rich-text MIME", async () => {
    const mime = buildOutgoingMimeMessage({
      text: "Hello world",
      html: "<p>Hello <strong>world</strong></p><ul><li>one</li></ul>",
    });

    await expect(parseDecryptedMailContent(mime)).resolves.toEqual({
      text: "Hello world",
      html: "<p>Hello <strong>world</strong></p><ul><li>one</li></ul>",
      attachments: [],
    });
  });
});
