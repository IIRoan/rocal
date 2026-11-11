import { describe, expect, it, jest } from "@jest/globals";
import {
  sealMailForSelf,
  sealOutgoingMessageBody,
  type MailSealer,
} from "../mail-outgoing-crypto";

function createSealer() {
  const encrypt = jest.fn<MailSealer["encrypt"]>(async (input) => ({
    armoredMessage: `ARMOR(${input.recipientPublicKeysArmored.join("+")})`,
  }));
  const upload = jest.fn<MailSealer["upload"]>(async () => ({
    blobId: "sealed-blob",
    size: 321,
  }));
  return {
    encrypt,
    upload,
    sealer: {
      isCurrent: () => true,
      selfPublicKeyArmored: "self-key",
      encrypt,
      upload,
    },
  };
}

const getRecipientPublicKey = jest.fn(async (email: string) => `key:${email}`);
const attachment = {
  filename: "notes.txt",
  contentType: "text/plain",
  content: new Uint8Array([104, 105]),
};

describe("sealMailForSelf", () => {
  it("encrypts text, HTML and attachments as one MIME body to the account's own key only", async () => {
    const { encrypt, upload, sealer } = createSealer();

    await expect(
      sealMailForSelf(
        {
          text: "Draft body",
          html: "<p>Draft body</p>",
          attachments: [attachment],
        },
        sealer,
      ),
    ).resolves.toEqual({ blobId: "sealed-blob", size: 321 });

    expect(encrypt).toHaveBeenCalledTimes(1);
    const { plaintext, recipientPublicKeysArmored } = encrypt.mock.calls[0][0];
    expect(recipientPublicKeysArmored).toEqual(["self-key"]);
    expect(plaintext).toContain("multipart/mixed");
    expect(plaintext).toContain("Draft body");
    expect(plaintext).toContain("<p>Draft body</p>");
    expect(plaintext).toContain('filename="notes.txt"');
    expect(upload).toHaveBeenCalledWith("ARMOR(self-key)");
  });
});

describe("sealOutgoingMessageBody", () => {
  it("submits external mail in plaintext and seals its Sent copy to the sender alone", async () => {
    const { encrypt, upload, sealer } = createSealer();

    const body = await sealOutgoingMessageBody({
      recipients: ["bob@solace.onl", "friend@gmail.com"],
      senderEmail: "alice@solace.onl",
      internalDomain: "solace.onl",
      content: {
        text: "Hello",
        html: "<p>Hello</p>",
        attachments: [attachment],
      },
      sealer,
      getRecipientPublicKey,
    });

    expect(body).toMatchObject({
      kind: "plaintext",
      contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      isCurrent: sealer.isCurrent,
      textBody: "Hello",
      encrypted: false,
      sentCopyCiphertext: { blobId: "sealed-blob", size: 321 },
    });
    expect(encrypt).toHaveBeenCalledWith({
      plaintext: expect.stringContaining('filename="notes.txt"'),
      recipientPublicKeysArmored: ["self-key"],
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(getRecipientPublicKey).not.toHaveBeenCalled();
  });

  it("encrypts internal mail to every recipient plus the sender, so the Sent copy stays readable", async () => {
    const { encrypt, sealer } = createSealer();

    const body = await sealOutgoingMessageBody({
      recipients: ["bob@solace.onl", "alice@solace.onl"],
      senderEmail: "Alice@solace.onl",
      internalDomain: "solace.onl",
      content: { text: "Secret" },
      sealer,
      getRecipientPublicKey,
    });

    expect(body).toMatchObject({
      kind: "inline",
      contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      isCurrent: sealer.isCurrent,
      textBody: "ARMOR(self-key+key:bob@solace.onl)",
      encrypted: true,
      sentCopyCiphertext: null,
    });
    expect(encrypt).toHaveBeenCalledWith({
      plaintext: "Secret",
      recipientPublicKeysArmored: ["self-key", "key:bob@solace.onl"],
    });
    expect(getRecipientPublicKey).not.toHaveBeenCalledWith("alice@solace.onl");
  });

  it("carries sealed attachment MIME through raw import so delivery recognizes encryption", async () => {
    const { encrypt, upload, sealer } = createSealer();

    const body = await sealOutgoingMessageBody({
      recipients: ["bob@solace.onl"],
      senderEmail: "alice@solace.onl",
      internalDomain: "solace.onl",
      content: { text: "See attached", attachments: [attachment] },
      sealer,
      getRecipientPublicKey,
    });

    expect(body).toMatchObject({
      kind: "import",
      contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      isCurrent: sealer.isCurrent,
      textBody: "",
      encrypted: true,
      pgpMimeMessage: "ARMOR(self-key+key:bob@solace.onl)",
      sentCopyCiphertext: null,
    });
    expect(encrypt.mock.calls[0][0].plaintext).toContain("multipart/mixed");
    expect(encrypt.mock.calls[0][0].plaintext).toContain(
      'filename="notes.txt"',
    );
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("outgoing snapshot boundaries", () => {
  it("changes the content fingerprint for actual text, HTML or attachment byte edits", async () => {
    const { fingerprintMailContent } = await import("../mail-outgoing-crypto");
    const base = {
      text: "body",
      html: "<p>body</p>",
      attachments: [attachment],
    };
    const fingerprint = await fingerprintMailContent(base, () => true);
    for (const content of [
      { ...base, text: "other" },
      { ...base, html: "<p>other</p>" },
      {
        ...base,
        attachments: [{ ...attachment, content: new Uint8Array([104, 106]) }],
      },
    ])
      expect(await fingerprintMailContent(content, () => true)).not.toBe(
        fingerprint,
      );
  });

  it("refuses a stale snapshot before encrypting and after an awaited lookup", async () => {
    const { encrypt, sealer } = createSealer();
    let current = false;
    const guarded = { ...sealer, isCurrent: () => current };
    const input = {
      recipients: ["bob@solace.onl"],
      senderEmail: "alice@solace.onl",
      internalDomain: "solace.onl",
      content: { text: "body" },
      sealer: guarded,
      getRecipientPublicKey: async () => {
        current = false;
        return "peer-key";
      },
    };
    await expect(sealOutgoingMessageBody(input)).rejects.toThrow(
      "mailbox changed",
    );
    expect(encrypt).not.toHaveBeenCalled();
    current = true;
    await expect(sealOutgoingMessageBody(input)).rejects.toThrow(
      "mailbox changed",
    );
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("checks the snapshot again after encryption before uploading", async () => {
    const { upload, sealer } = createSealer();
    let current = true;
    const guarded = {
      ...sealer,
      isCurrent: () => current,
      encrypt: async () => {
        current = false;
        return { armoredMessage: "ciphertext" };
      },
    };
    await expect(sealMailForSelf({ text: "body" }, guarded)).rejects.toThrow(
      "mailbox changed",
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects an encrypted variant at the plaintext upload boundary", async () => {
    const { uploadPlaintextMailAttachments } =
      await import("../mail-outgoing-crypto");
    const upload = jest.fn(async () => "uploaded");
    const encrypted = {
      kind: "import" as const,
      textBody: "",
      encrypted: true as const,
      pgpMimeMessage: "ciphertext",
      contentFingerprint: "a".repeat(64),
      isCurrent: () => true,
      sentCopyCiphertext: null,
    };
    // @ts-expect-error Encrypted variants cannot enter the plaintext attachment upload boundary.
    const blockedUpload = uploadPlaintextMailAttachments(encrypted, upload);
    await expect(blockedUpload).rejects.toThrow("cannot upload plaintext");
    expect(upload).not.toHaveBeenCalled();
  });
});
