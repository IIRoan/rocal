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
  return { encrypt, upload, sealer: { selfPublicKeyArmored: "self-key", encrypt, upload } };
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
        { text: "Draft body", html: "<p>Draft body</p>", attachments: [attachment] },
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
      content: { text: "Hello", html: "<p>Hello</p>", attachments: [attachment] },
      sealer,
      getRecipientPublicKey,
    });

    expect(body).toEqual({
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

    expect(body).toEqual({
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

  it("carries internal attachments inside PGP/MIME instead of plaintext blobs", async () => {
    const { encrypt, upload, sealer } = createSealer();

    const body = await sealOutgoingMessageBody({
      recipients: ["bob@solace.onl"],
      senderEmail: "alice@solace.onl",
      internalDomain: "solace.onl",
      content: { text: "See attached", attachments: [attachment] },
      sealer,
      getRecipientPublicKey,
    });

    expect(body).toEqual({
      textBody: "",
      encrypted: true,
      pgpMimeCiphertext: { blobId: "sealed-blob", size: 321 },
      sentCopyCiphertext: null,
    });
    expect(encrypt.mock.calls[0][0].plaintext).toContain("multipart/mixed");
    expect(upload).toHaveBeenCalledWith("ARMOR(self-key+key:bob@solace.onl)");
  });
});
