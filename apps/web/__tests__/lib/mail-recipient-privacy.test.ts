import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as openpgp from "openpgp";
import {
  encryptMailForRecipients,
  sealMailForSelf,
  sealOutgoingMessageBody,
  type MailSealer,
} from "@workspace/calendar-core";
import {
  clearActiveMailVault,
  encryptForRecipients,
  loadActiveMailVault,
} from "@/lib/mail/mail-encryption-engine";
import { parseDecryptedMailContent } from "@/lib/mail/decrypted-mail-content";

jest.mock("openpgp", () => {
  const actual = jest.requireActual<typeof import("openpgp")>("openpgp");
  return { ...actual, readKey: jest.fn(actual.readKey) };
});

const actualOpenPgp = jest.requireActual<typeof import("openpgp")>("openpgp");
const PASSPHRASE = "synthetic-recipient-privacy-passphrase";
const TEXT = "Synthetic private message";
const ATTACHMENT = new TextEncoder().encode("synthetic attachment content");

type TestKey = {
  email: string;
  publicKey: openpgp.Key;
  privateKey: openpgp.PrivateKey;
  encryptedPrivateKey: string;
};

const keys: TestKey[] = [];

function getKey(index: number): TestKey {
  const key = keys[index];
  if (!key) throw new Error("Synthetic key not found");
  return key;
}

async function loadKey(key: TestKey): Promise<void> {
  await loadActiveMailVault({
    publicKeyArmored: key.publicKey.armor(),
    privateKeyArmored: key.encryptedPrivateKey,
    privateKeyPassphrase: PASSPHRASE,
  });
}

async function assertPrivateCiphertext(
  armoredMessage: string,
  recipients: TestKey[],
): Promise<string> {
  const message = await openpgp.readMessage({ armoredMessage });
  expect(message.getEncryptionKeyIDs()).toHaveLength(recipients.length);
  expect(message.getEncryptionKeyIDs().map((id) => id.toHex())).toEqual(
    recipients.map(() => "0000000000000000"),
  );
  let plaintext = "";
  for (const recipient of recipients) {
    const result = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage }),
      decryptionKeys: recipient.privateKey,
      verificationKeys: getKey(0).publicKey,
    });
    expect(result.signatures).toHaveLength(1);
    const signature = result.signatures[0];
    if (!signature) throw new Error("Expected a sender signature");
    await expect(signature.verified).resolves.toBe(true);
    plaintext = String(result.data);
  }
  await expect(
    openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage }),
      decryptionKeys: getKey(4).privateKey,
    }),
  ).rejects.toThrow();
  return plaintext;
}

beforeAll(async () => {
  for (const name of ["sender", "to", "cc", "bcc", "unrelated"]) {
    const email = `${name}@solace.test`;
    const generated = await openpgp.generateKey({
      type: "ecc",
      curve: "curve25519Legacy",
      userIDs: [{ email }],
      format: "object",
    });
    const encryptedPrivateKey = await openpgp.encryptKey({
      privateKey: generated.privateKey,
      passphrase: PASSPHRASE,
    });
    keys.push({
      email,
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      encryptedPrivateKey: encryptedPrivateKey.armor(),
    });
  }
}, 30_000);

beforeEach(async () => {
  jest.mocked(openpgp.readKey).mockImplementation(actualOpenPgp.readKey);
  clearActiveMailVault();
  await loadKey(getKey(0));
});

afterEach(() => {
  jest.restoreAllMocks();
  clearActiveMailVault();
});

function createSealer(uploads: string[]): MailSealer {
  return {
    selfPublicKeyArmored: getKey(0).publicKey.armor(),
    isCurrent: () => true,
    encrypt: encryptForRecipients,
    upload: async (armoredMessage) => {
      uploads.push(armoredMessage);
      return { blobId: `blob-${uploads.length}`, size: armoredMessage.length };
    },
  };
}

it.each([
  { name: "Bcc-only", recipients: ["bcc@solace.test"], expected: [0, 3] },
  {
    name: "To/Cc/Bcc",
    recipients: ["to@solace.test", "cc@solace.test", "bcc@solace.test"],
    expected: [0, 1, 2, 3],
  },
  {
    name: "normalized duplicate recipients",
    recipients: [" TO@SOLACE.TEST ", "to@solace.test", "bcc@solace.test"],
    expected: [0, 1, 3],
  },
])(
  "conceals every key identifier through the shared inline sealer: $name",
  async ({ recipients, expected }) => {
    const result = await sealOutgoingMessageBody({
      recipients,
      senderEmail: getKey(0).email,
      internalDomain: "solace.test",
      content: { text: TEXT },
      sealer: createSealer([]),
      getRecipientPublicKey: async (email) => {
        const key = keys.find(
          (entry) => entry.email === email.trim().toLowerCase(),
        );
        if (!key) throw new Error("Synthetic recipient not found");
        return key.publicKey.armor();
      },
    });
    expect(result.encrypted).toBe(true);
    expect(
      await assertPrivateCiphertext(result.textBody, expected.map(getKey)),
    ).toBe(TEXT);
  },
);

it("preserves rich text and attachments through the actual engine", async () => {
  const uploads: string[] = [];
  const result = await sealOutgoingMessageBody({
    recipients: [getKey(3).email],
    senderEmail: getKey(0).email,
    internalDomain: "solace.test",
    content: {
      text: TEXT,
      html: `<p>${TEXT}</p>`,
      attachments: [
        {
          filename: "notes.txt",
          contentType: "text/plain",
          content: ATTACHMENT,
        },
      ],
    },
    sealer: createSealer(uploads),
    getRecipientPublicKey: async () => getKey(3).publicKey.armor(),
  });
  expect(result.pgpMimeMessage).toContain("-----BEGIN PGP MESSAGE-----");
  expect(uploads).toHaveLength(0);
  const parsed = await parseDecryptedMailContent(
    await assertPrivateCiphertext(result.pgpMimeMessage ?? "", [
      getKey(0),
      getKey(3),
    ]),
  );
  expect(parsed.text).toBe(TEXT);
  expect(parsed.html).toBe(`<p>${TEXT}</p>`);
  const attachment = parsed.attachments[0];
  if (!attachment || !(attachment.content instanceof ArrayBuffer)) {
    throw new Error("Expected decrypted attachment bytes");
  }
  expect(new Uint8Array(attachment.content)).toEqual(ATTACHMENT);
});

it("keeps self-only drafts and external Sent copies anonymous and readable", async () => {
  const uploads: string[] = [];
  const sealer = createSealer(uploads);
  await sealMailForSelf({ text: TEXT }, sealer);
  const sent = await sealOutgoingMessageBody({
    recipients: ["external@example.test"],
    senderEmail: getKey(0).email,
    internalDomain: "solace.test",
    content: { text: TEXT },
    sealer,
    getRecipientPublicKey: async () => {
      throw new Error("External send must not fetch an internal key");
    },
  });
  expect(sent.encrypted).toBe(false);
  expect(sent.textBody).toBe(TEXT);
  expect(sent.sentCopyCiphertext?.blobId).toBe("blob-2");
  for (const ciphertext of uploads) {
    const parsed = await parseDecryptedMailContent(
      await assertPrivateCiphertext(ciphertext, [getKey(0)]),
    );
    expect(parsed.text).toBe(TEXT);
  }
});

it.each([false, true])(
  "rejects encryption when the vault is cleared during recipient parsing (switch=%s)",
  async (switchAccount) => {
    let resume: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const readKey = actualOpenPgp.readKey;
    jest.mocked(openpgp.readKey).mockImplementation(async (input) => {
      if (
        "armoredKey" in input &&
        input.armoredKey === getKey(1).publicKey.armor()
      ) {
        entered?.();
        await paused;
      }
      return "armoredKey" in input ? readKey(input) : readKey(input);
    });
    const result = encryptForRecipients({
      plaintext: TEXT,
      recipientPublicKeysArmored: [getKey(1).publicKey.armor()],
    });
    const rejection = expect(result).rejects.toThrow(
      "Mail encryption session changed",
    );
    await started;
    clearActiveMailVault();
    if (switchAccount) await loadKey(getKey(2));
    resume?.();
    await rejection;
  },
);

it("does not restore a vault whose load finishes after clear", async () => {
  let resume: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  jest.mocked(openpgp.readKey).mockImplementation(async (input) => {
    entered?.();
    await paused;
    return "armoredKey" in input
      ? actualOpenPgp.readKey(input)
      : actualOpenPgp.readKey(input);
  });
  const loading = loadKey(getKey(2));
  const rejection = expect(loading).rejects.toThrow(
    "Mail encryption session changed",
  );
  await started;
  clearActiveMailVault();
  resume?.();
  await rejection;
  expect(() =>
    encryptForRecipients({
      plaintext: TEXT,
      recipientPublicKeysArmored: [getKey(1).publicKey.armor()],
    }),
  ).toThrow("Mail vault is not loaded");
});

it("rejects a real ciphertext whose signing context ended during encryption", async () => {
  let isCurrent = true;
  let resume: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const result = encryptMailForRecipients<
    openpgp.Key,
    openpgp.PrivateKey,
    openpgp.Message<string>
  >(
    {
      plaintext: TEXT,
      recipientPublicKeysArmored: [getKey(1).publicKey.armor()],
    },
    { signingKey: getKey(0).privateKey, isCurrent: () => isCurrent },
    {
      ...actualOpenPgp,
      encrypt: async (input) => {
        expect(input.signingKeys).toBe(getKey(0).privateKey);
        entered?.();
        await paused;
        return actualOpenPgp.encrypt(input);
      },
    },
  );
  const rejection = expect(result).rejects.toThrow(
    "Mail encryption session changed",
  );
  await started;
  isCurrent = false;
  resume?.();
  await rejection;
});
