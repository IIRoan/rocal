import { describe, expect, it } from "@jest/globals";

import {
  classifyMessageEncryption,
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
