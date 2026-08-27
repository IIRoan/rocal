import {
  buildMailPreviewSnippet,
  ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER,
  listPreviewSnippet,
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

  it("strips quoted reply chains from decrypted previews", () => {
    expect(
      buildMailPreviewSnippet(
        message({
          textBody: [{ partId: "text" }],
          bodyValues: {
            text: {
              value:
                "Let's meet Thursday.\n\nOn Mon, 1 Jan 2026 at 12:00, Ada wrote:\n> earlier",
            },
          },
        }),
      ),
    ).toBe("Let's meet Thursday.");
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

  it("hides the encrypted placeholder in list snippets", () => {
    expect(
      listPreviewSnippet(
        message({
          textBody: [{ partId: "text" }],
          bodyValues: {
            text: {
              value:
                "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----",
            },
          },
        }),
      ),
    ).toBe("");
    expect(
      listPreviewSnippet(
        message({
          textBody: [{ partId: "text" }],
          bodyValues: {
            text: {
              value:
                "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----",
            },
          },
        }),
        { text: "Lunch at noon" },
      ),
    ).toBe("Lunch at noon");
  });
});
