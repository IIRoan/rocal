import { describe, expect, it } from "@jest/globals";

import {
  classifyMessageEncryption,
  extractEncryptedBodyBlobId,
  extractMessageBodies,
  resolveInlinePgpArmoredCiphertext,
  resolveMessageSecurityLabel,
  resolveSecurityLabels,
} from "../../lib/mail/message-security";

describe("mail message security helpers", () => {
  it("detects inline PGP messages from text bodies", () => {
    expect(
      classifyMessageEncryption({
        bodyValues: {
          text: {
            value: "hello\n-----BEGIN PGP MESSAGE-----\nVersion: OpenPGP\n...",
          },
        },
        textBody: [{ partId: "text" }],
      }),
    ).toBe("inline_pgp");
  });

  it("detects PGP/MIME messages from the body structure", () => {
    expect(
      classifyMessageEncryption({
        bodyStructure: {
          type: "multipart/encrypted",
          subParts: [],
        },
      }),
    ).toBe("pgp_mime");
  });

  it("marks non-PGP content as plain", () => {
    expect(
      classifyMessageEncryption({
        bodyValues: {
          text: {
            value: "Just a normal message",
          },
        },
        textBody: [{ partId: "text" }],
      }),
    ).toBe("plain");
  });

  it("ignores stale html previews when the text body is inline PGP", () => {
    expect(
      extractMessageBodies({
        bodyValues: {
          text: {
            value:
              "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----",
          },
          html: { value: "<p>visible preview</p>" },
        },
        textBody: [{ partId: "text" }],
        htmlBody: [{ partId: "html" }],
      } as never),
    ).toEqual({
      text: "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----",
      html: null,
    });
  });

  it("prefers complete inline ciphertext and falls back to blobs", async () => {
    const complete =
      "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----";
    await expect(
      resolveInlinePgpArmoredCiphertext({
        message: {
          bodyValues: { text: { value: complete } },
          textBody: [{ partId: "text" }],
        },
        fetchBlob: async () => "blob-ciphertext",
      }),
    ).resolves.toBe(complete);

    await expect(
      resolveInlinePgpArmoredCiphertext({
        message: {
          bodyValues: { text: { value: "-----BEGIN PGP MESSAGE-----\nabc" } },
          textBody: [{ partId: "text" }],
          bodyStructure: { type: "text/plain", blobId: "blob-text" },
        },
        fetchBlob: async () => complete,
      }),
    ).resolves.toBe(complete);
  });

  it("falls back to encrypted body blobs when inline values are omitted", () => {
    expect(
      extractEncryptedBodyBlobId({
        textBody: [{ partId: "text" }],
        bodyValues: {},
        bodyStructure: {
          type: "text/plain",
          blobId: "blob-text",
        } as never,
      }),
    ).toBe("blob-text");

    expect(
      extractEncryptedBodyBlobId({
        textBody: [{ partId: "text" }],
        bodyValues: {
          text: {
            value: "-----BEGIN PGP MESSAGE-----\nabc",
          },
        },
        bodyStructure: {
          type: "text/plain",
        } as never,
      }),
    ).toBeNull();
  });

  it("resolves encrypted-at-rest and verified signature labels", () => {
    expect(
      resolveSecurityLabels({
        messageState: "inline_pgp",
        accountEncryptedAtRest: true,
        hasVerifiedSignature: true,
        decryptionFailed: false,
      }),
    ).toEqual(["E2EE encrypted", "Encrypted at rest", "Signature verified"]);
  });

  it("resolves clean failure labels when local decryption fails", () => {
    expect(
      resolveSecurityLabels({
        messageState: "inline_pgp",
        accountEncryptedAtRest: false,
        hasVerifiedSignature: false,
        decryptionFailed: true,
      }),
    ).toEqual(["E2EE encrypted", "Decryption failed"]);
  });

  it("distinguishes unverifiable and failed PGP signatures", () => {
    expect(
      resolveMessageSecurityLabel({
        messageState: "inline_pgp",
        accountEncryptedAtRest: false,
        signatureVerificationState: "unverified",
        decryptionFailed: false,
      }),
    ).toBe("PGP encrypted, signature not verified");

    expect(
      resolveMessageSecurityLabel({
        messageState: "inline_pgp",
        accountEncryptedAtRest: false,
        signatureVerificationState: "failed",
        decryptionFailed: false,
      }),
    ).toBe("PGP encrypted, signature check failed");
  });
});
