import {
  buildMailPreviewSnippet,
  ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER,
  messageNeedsDecryptedPreview,
} from "./mail-preview";
import type { JmapEmailMessage } from "./types";

function message(partial: Partial<JmapEmailMessage>): JmapEmailMessage {
  return {
    id: "m1",
    ...partial,
  };
}

describe("buildMailPreviewSnippet", () => {
  it("returns plaintext body preview", () => {
    expect(
      buildMailPreviewSnippet(
        message({
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Hello there\n\nnext line" } },
        }),
      ),
    ).toBe("Hello there next line");
  });

  it("never returns raw PGP armor", () => {
    expect(
      buildMailPreviewSnippet(
        message({
          textBody: [{ partId: "text" }],
          bodyValues: {
            text: {
              value:
                "-----BEGIN PGP MESSAGE-----\nVersion: OpenPGP\n\nciphertext\n-----END PGP MESSAGE-----",
            },
          },
        }),
      ),
    ).toBe(ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER);
  });

  it("uses decrypted content when provided", () => {
    expect(
      buildMailPreviewSnippet(
        message({
          textBody: [{ partId: "text" }],
          bodyValues: {
            text: {
              value:
                "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----",
            },
          },
        }),
        { text: "Secret hello" },
      ),
    ).toBe("Secret hello");
  });

  it("treats PGP preview metadata as needing decryption", () => {
    expect(
      messageNeedsDecryptedPreview(
        message({
          preview: "-----BEGIN PGP MESSAGE-----\nwV4DLkWi",
        }),
      ),
    ).toBe(true);
  });

  it("prefers plaintext body over armored preview metadata", () => {
    expect(
      buildMailPreviewSnippet(
        message({
          preview: "-----BEGIN PGP MESSAGE-----\nwV4DLkWi",
          textBody: [{ partId: "text" }],
          bodyValues: { text: { value: "Hello from the full body" } },
        }),
      ),
    ).toBe("Hello from the full body");
  });
});
