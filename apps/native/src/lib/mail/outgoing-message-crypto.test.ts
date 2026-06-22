jest.mock("./mail-crypto", () => ({
  encryptForRecipients: jest.fn(),
  ensureVaultLoaded: jest.fn(),
}));

jest.mock("./mail-api", () => ({
  getRecipientKey: jest.fn(),
}));

import { encryptForRecipients, ensureVaultLoaded } from "./mail-crypto";
import { getRecipientKey } from "./mail-api";
import { resolveOutgoingMessageBody } from "./outgoing-message-crypto";
import type { MailRuntime } from "./mail-runtime";

function createRuntime(
  overrides: Partial<MailRuntime["config"]> = {},
): MailRuntime {
  return {
    config: {
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "https://mail.solace.onl",
      signupEnabled: true,
      oauth: {} as MailRuntime["config"]["oauth"],
      vaultKeyMaterialEndpoint:
        "https://api.solace.test/api/mail/vault-key-material",
      ...overrides,
    },
    client: {} as MailRuntime["client"],
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

describe("resolveOutgoingMessageBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ensureVaultLoaded as jest.Mock).mockResolvedValue({
      vault: { publicKeyArmored: "sender-public-key" },
    });
    (getRecipientKey as jest.Mock).mockResolvedValue({
      publicKeyArmored: "recipient-public-key",
    });
    (encryptForRecipients as jest.Mock).mockResolvedValue({
      armoredMessage:
        "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----",
    });
  });

  it("returns plaintext for external recipients without touching the vault", async () => {
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["friend@gmail.com"],
      plaintext: "Hello Gmail",
    });

    expect(result).toEqual({
      textBody: "Hello Gmail",
      encrypted: false,
    });
    expect(ensureVaultLoaded).not.toHaveBeenCalled();
    expect(getRecipientKey).not.toHaveBeenCalled();
    expect(encryptForRecipients).not.toHaveBeenCalled();
  });

  it("returns plaintext for mixed internal and external recipients", async () => {
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["bob@solace.onl", "friend@gmail.com"],
      plaintext: "Hello everyone",
    });

    expect(result).toEqual({
      textBody: "Hello everyone",
      encrypted: false,
    });
    expect(encryptForRecipients).not.toHaveBeenCalled();
  });

  it("returns plaintext when the configured internal domain is missing", async () => {
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime({ defaultDomain: "" }),
      recipients: ["bob@solace.onl"],
      plaintext: "Hello Bob",
    });

    expect(result).toEqual({
      textBody: "Hello Bob",
      encrypted: false,
    });
    expect(encryptForRecipients).not.toHaveBeenCalled();
  });

  it("encrypts when every recipient is on the configured Solace domain", async () => {
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["bob@solace.onl"],
      plaintext: "Secret body",
    });

    expect(result.encrypted).toBe(true);
    expect(result.textBody).toContain("BEGIN PGP MESSAGE");
    expect(encryptForRecipients).toHaveBeenCalledWith({
      plaintext: "Secret body",
      recipientPublicKeysArmored: expect.arrayContaining([
        "sender-public-key",
        "recipient-public-key",
      ]),
    });
  });

  it("includes cc and bcc recipients in the internal-only encryption check", async () => {
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["bob@solace.onl", "watch@solace.onl", "spy@gmail.com"],
      plaintext: "Should stay plaintext",
    });

    expect(result.encrypted).toBe(false);
    expect(result.textBody).toBe("Should stay plaintext");
    expect(encryptForRecipients).not.toHaveBeenCalled();
  });

  it("uploads PGP/MIME ciphertext when attachments are present for internal mail", async () => {
    const uploadPgpMimeCiphertext = jest
      .fn()
      .mockResolvedValue({ blobId: "blob-1", size: 128 });

    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["bob@solace.onl"],
      plaintext: "See attached",
      mimeAttachments: [
        {
          filename: "notes.txt",
          contentType: "text/plain",
          content: new Uint8Array([1, 2, 3]),
        },
      ],
      uploadPgpMimeCiphertext,
    });

    expect(result).toEqual({
      textBody: "",
      encrypted: true,
      pgpMimeCiphertext: { blobId: "blob-1", size: 128 },
    });
    expect(uploadPgpMimeCiphertext).toHaveBeenCalledWith(
      "-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----",
    );
  });

  it("does not upload PGP/MIME ciphertext for external recipients with attachments", async () => {
    const uploadPgpMimeCiphertext = jest.fn();

    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["friend@gmail.com"],
      plaintext: "See attached",
      mimeAttachments: [
        {
          filename: "notes.txt",
          contentType: "text/plain",
          content: new Uint8Array([1, 2, 3]),
        },
      ],
      uploadPgpMimeCiphertext,
    });

    expect(result).toEqual({
      textBody: "See attached",
      encrypted: false,
    });
    expect(uploadPgpMimeCiphertext).not.toHaveBeenCalled();
  });
});
