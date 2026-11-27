import { encryptForRecipients, ensureVaultLoaded, signDetached } from "./mail-crypto";
import { getRecipientKey } from "./mail-api";
import { resolveOutgoingMessageBody } from "./outgoing-message-crypto";
import type { MailRuntime } from "./mail-runtime";
import { StalwartJmapClient } from "./jmap-client";

jest.mock("./mail-crypto", () => ({
  encryptForRecipients: jest.fn(),
  ensureVaultLoaded: jest.fn(),
  isMailVaultCurrent: jest.fn(() => true),
  signDetached: jest.fn(),
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
    client: Object.assign(new StalwartJmapClient({ baseUrl: "https://mail.solace.test", accessToken: "synthetic-token" }), { uploadBlob }),
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
      kind: "plaintext",
      contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      isCurrent: expect.any(Function),
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

  it("carries sealed internal attachment MIME through raw import", async () => {
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["bob@solace.onl"],
      plaintext: "See attached",
      html: "<p>See attached</p>",
      mimeAttachments: [attachment],
    });

    expect(result).toEqual({
      kind: "import",
      contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      isCurrent: expect.any(Function),
      textBody: "",
      encrypted: true,
      pgpMimeMessage: ARMORED,
      sentCopyCiphertext: null,
    });
    expect(encryptForRecipients).toHaveBeenCalledWith({
      plaintext: expect.stringContaining("Content-Type: text/html; charset=utf-8"),
      recipientPublicKeysArmored: ["sender-public-key", "recipient-public-key"],
    });
    expect(getRecipientKey).toHaveBeenCalledWith("bob@solace.onl");
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it("signs outside mail with the vault key when signing is on, beside the sealed Sent copy", async () => {
    (signDetached as jest.Mock).mockResolvedValue({
      armoredSignature: "-----BEGIN PGP SIGNATURE-----\n\nAAAA\n-----END PGP SIGNATURE-----",
      micalg: "pgp-sha512",
    });
    const result = await resolveOutgoingMessageBody({
      runtime: createRuntime(),
      recipients: ["bob@example.com"],
      plaintext: "Signed",
      mimeAttachments: [attachment],
      sign: true,
    });

    expect(result).toMatchObject({
      kind: "signed",
      encrypted: false,
      textBody: "",
      sentCopyCiphertext: { blobId: "sealed-blob", size: ARMORED.length },
    });
    expect(result.signedMimeMessage).toMatch(/^Content-Type: multipart\/signed; micalg=pgp-sha512; protocol="application\/pgp-signature"/);
    const signed = (signDetached as jest.Mock).mock.calls[0]?.[0]?.data as string;
    expect(signed).toContain("Content-Type: application/pgp-keys");
    expect(signed).toContain('filename="notes.txt"');
    expect(result.signedMimeMessage).toContain(`\r\n${signed}\r\n`);
    expect(getRecipientKey).not.toHaveBeenCalled();
  });
});
