import { encryptForRecipients, ensureVaultLoaded } from "./mail-crypto";
import { getRecipientKey } from "./mail-api";
import { resolveOutgoingMessageBody } from "./outgoing-message-crypto";
import type { MailRuntime } from "./mail-runtime";

jest.mock("./mail-crypto", () => ({
  encryptForRecipients: jest.fn(),
  ensureVaultLoaded: jest.fn(),
}));

jest.mock("./mail-api", () => ({
  getRecipientKey: jest.fn(),
}));

const ARMORED = "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----";
const uploadBlob = jest.fn();

function createRuntime(): MailRuntime {
  return {
    config: {
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "https://mail.solace.onl",
      signupEnabled: true,
      oauth: {} as MailRuntime["config"]["oauth"],
    },
    client: { uploadBlob } as unknown as MailRuntime["client"], // Only the blob upload is exercised.
    session: {} as MailRuntime["session"],
    accountId: "acc-1",
    mailboxes: [],
    identities: [{ id: "identity-1", email: "alice@solace.onl", name: "Alice" }],
    pickerIdentities: [
      { id: "identity-1", email: "alice@solace.onl", name: "Alice" },
    ],
    encryptedAtRest: false,
    mailServerPolicy: {} as MailRuntime["mailServerPolicy"],
  };
}

const attachment = {
  filename: "notes.txt",
  contentType: "text/plain",
  content: new Uint8Array([1, 2, 3]),
};

describe("resolveOutgoingMessageBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ensureVaultLoaded as jest.Mock).mockResolvedValue({
      vault: { publicKeyArmored: "sender-public-key" },
    });
    (getRecipientKey as jest.Mock).mockResolvedValue({
      publicKeyArmored: "recipient-public-key",
    });
    (encryptForRecipients as jest.Mock).mockResolvedValue({ armoredMessage: ARMORED });
    uploadBlob.mockResolvedValue({
      blobId: "sealed-blob",
      size: ARMORED.length,
      name: "",
      type: "text/plain",
    });
  });

  it("submits external mail in plaintext and uploads a Sent copy sealed to the vault key", async () => {
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["bob@solace.onl", "friend@gmail.com"],
      plaintext: "Hello Gmail",
      html: "<p>Hello Gmail</p>",
      mimeAttachments: [attachment],
    });

    expect(result).toEqual({
      textBody: "Hello Gmail",
      encrypted: false,
      sentCopyCiphertext: { blobId: "sealed-blob", size: ARMORED.length },
    });
    expect(encryptForRecipients).toHaveBeenCalledWith({
      plaintext: expect.stringContaining('filename="notes.txt"'),
      recipientPublicKeysArmored: ["sender-public-key"],
    });
    expect(uploadBlob).toHaveBeenCalledWith(
      {},
      new TextEncoder().encode(ARMORED),
      "text/plain",
    );
    expect(getRecipientKey).not.toHaveBeenCalled();
  });

  it("encrypts internal mail with attachments to the recipient and sender as PGP/MIME", async () => {
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["bob@solace.onl"],
      plaintext: "See attached",
      html: "<p>See attached</p>",
      mimeAttachments: [attachment],
    });

    expect(result).toEqual({
      textBody: "",
      encrypted: true,
      pgpMimeCiphertext: { blobId: "sealed-blob", size: ARMORED.length },
      sentCopyCiphertext: null,
    });
    expect(encryptForRecipients).toHaveBeenCalledWith({
      plaintext: expect.stringContaining("Content-Type: text/html; charset=utf-8"),
      recipientPublicKeysArmored: ["sender-public-key", "recipient-public-key"],
    });
    expect(getRecipientKey).toHaveBeenCalledWith("bob@solace.onl");
  });
});
