jest.mock("./mail-crypto", () => ({
  ensureVaultLoaded: jest.fn(),
  decryptMailMessage: jest.fn(),
  decryptPgpMimeMessage: jest.fn(),
}));

jest.mock("./mail-api", () => ({
  getRecipientKey: jest.fn(),
}));

jest.mock("./message-security", () => ({
  classifyMessageEncryption: jest.fn(),
  resolveInlinePgpArmoredCiphertext: jest.fn(),
}));

import {
  decryptMailMessage,
  decryptPgpMimeMessage,
  ensureVaultLoaded,
} from "./mail-crypto";
import { getRecipientKey } from "./mail-api";
import {
  decryptEncryptedMessage,
  resolveSenderVerificationKey,
} from "./mail-sender-key";
import {
  classifyMessageEncryption,
  resolveInlinePgpArmoredCiphertext,
} from "./message-security";
import type { MailRuntime } from "./mail-runtime";
import type { JmapEmailMessage } from "./types";

function createRuntime(
  overrides: Partial<MailRuntime> = {},
): MailRuntime {
  return {
    config: {
      defaultDomain: "solace.onl",
      discoveryBaseUrl: "https://mail.solace.onl",
      signupEnabled: true,
      oauth: {} as MailRuntime["config"]["oauth"],
      vaultKeyMaterialEndpoint:
        "https://api.solace.test/api/mail/vault-key-material",
    },
    client: {} as MailRuntime["client"],
    session: { username: "alice@solace.onl" } as MailRuntime["session"],
    accountId: "acc-1",
    mailboxes: [],
    identities: [{ id: "identity-1", email: "alice@solace.onl", name: "Alice" }],
    pickerIdentities: [
      { id: "identity-1", email: "alice@solace.onl", name: "Alice" },
    ],
    encryptedAtRest: false,
    mailServerPolicy: {} as MailRuntime["mailServerPolicy"],
    ...overrides,
  };
}

describe("resolveSenderVerificationKey", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ensureVaultLoaded as jest.Mock).mockResolvedValue({
      vault: { publicKeyArmored: "self-public-key" },
    });
    (getRecipientKey as jest.Mock).mockResolvedValue({
      publicKeyArmored: "bob-public-key",
    });
  });

  it("returns the vault public key for the current user", async () => {
    const key = await resolveSenderVerificationKey(
      createRuntime(),
      "Alice@Solace.Onl",
    );

    expect(key).toBe("self-public-key");
    expect(ensureVaultLoaded).toHaveBeenCalled();
    expect(getRecipientKey).not.toHaveBeenCalled();
  });

  it("looks up the directory key for another internal sender", async () => {
    const key = await resolveSenderVerificationKey(
      createRuntime(),
      "bob@solace.onl",
    );

    expect(key).toBe("bob-public-key");
    expect(getRecipientKey).toHaveBeenCalledWith("bob@solace.onl");
    expect(ensureVaultLoaded).not.toHaveBeenCalled();
  });

  it("returns undefined for external senders", async () => {
    const key = await resolveSenderVerificationKey(
      createRuntime(),
      "friend@gmail.com",
    );

    expect(key).toBeUndefined();
    expect(getRecipientKey).not.toHaveBeenCalled();
    expect(ensureVaultLoaded).not.toHaveBeenCalled();
  });

  it("returns undefined when the sender address is missing", async () => {
    await expect(
      resolveSenderVerificationKey(createRuntime(), undefined),
    ).resolves.toBeUndefined();
  });

  it("returns undefined when the directory lookup fails", async () => {
    (getRecipientKey as jest.Mock).mockRejectedValue(new Error("not found"));

    await expect(
      resolveSenderVerificationKey(createRuntime(), "bob@solace.onl"),
    ).resolves.toBeUndefined();
  });
});

describe("decryptEncryptedMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRecipientKey as jest.Mock).mockResolvedValue({
      publicKeyArmored: "bob-public-key",
    });
    (decryptMailMessage as jest.Mock).mockResolvedValue({
      plaintext: "hello",
      signatureVerificationState: "verified",
    });
    (decryptPgpMimeMessage as jest.Mock).mockResolvedValue({
      plaintext: "hello mime",
      signatureVerificationState: "verified",
    });
    (resolveInlinePgpArmoredCiphertext as jest.Mock).mockResolvedValue(
      "-----BEGIN PGP MESSAGE-----",
    );
  });

  it("passes the sender key into inline PGP decrypt", async () => {
    (classifyMessageEncryption as jest.Mock).mockReturnValue("inline_pgp");
    const runtime = createRuntime();
    const message = {
      id: "msg-1",
      from: [{ email: "bob@solace.onl" }],
    } as JmapEmailMessage;

    await decryptEncryptedMessage(runtime, message);

    expect(decryptMailMessage).toHaveBeenCalledWith(
      runtime,
      "msg-1",
      "-----BEGIN PGP MESSAGE-----",
      "bob-public-key",
    );
  });

  it("passes the sender key into PGP/MIME decrypt", async () => {
    (classifyMessageEncryption as jest.Mock).mockReturnValue("pgp_mime");
    const runtime = createRuntime();
    const message = {
      id: "msg-2",
      from: [{ email: "bob@solace.onl" }],
      bodyStructure: { type: "multipart/encrypted" },
    } as JmapEmailMessage;

    await decryptEncryptedMessage(runtime, message);

    expect(decryptPgpMimeMessage).toHaveBeenCalledWith(
      runtime,
      "msg-2",
      message.bodyStructure,
      "bob-public-key",
    );
  });
});
