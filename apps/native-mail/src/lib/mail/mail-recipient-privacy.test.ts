import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { activateSessionData, suspendSessionData } from "@workspace/native-core/lib/session-data-lifecycle";
import * as openpgp from "openpgp";
import {
  sealMailForSelf,
  sealOutgoingMessageBody,
  type MailSealer,
} from "@workspace/calendar-core";
import {
  clearVaultCache,
  decryptMailMessage,
  encryptForRecipients,
  ensureVaultLoaded,
} from "./mail-crypto";
import { parseMimeBody as parseDecryptedMailContent } from "./mail-mime-parser";
import type { UserKeyVault } from "./native-vault-crypto";
import type { MailRuntime } from "./mail-runtime";

let mockVault: UserKeyVault | null = null;
let mockCachedPrivateKey = "";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock("@workspace/native-core/lib/constants", () => ({
  API_BASE_URL: "https://api.example.test",
}));

jest.mock("./mail-api", () => ({
  mailFetch: async () => ({
    ok: true,
    json: async () => ({
      email: "sender@solace.test",
      vaultVersion: 1,
      encryptedVaultB64: "synthetic-unlock-fixture",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "synthetic-salt",
        memoryKiB: 8192,
        iterations: 1,
        parallelism: 1,
      },
      wrappedSecret: "synthetic-wrapped-secret",
    }),
  }),
  upsertAccountVaultBackup: jest.fn(),
}));

jest.mock("./vault-secret", () => ({
  unwrapVaultSecret: async () => "synthetic-secret",
}));

jest.mock("./native-vault-crypto", () => ({
  unlockEncryptedMailVault: async () => {
    if (!mockVault) throw new Error("Synthetic vault not selected");
    return mockVault;
  },
  createEncryptedMailVault: jest.fn(),
}));

jest.mock("./mail-password-cache", () => ({
  loadCachedPrivateKey: async () => mockCachedPrivateKey,
  saveCachedPrivateKey: jest.fn(),
}));

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
  mockVault = {
    userId: "synthetic-user",
    email: key.email,
    publicKeyArmored: key.publicKey.armor(),
    publicKeyFingerprint: key.publicKey.getFingerprint(),
    encryptedPrivateKeyArmored: key.encryptedPrivateKey,
    kdf: "argon2id",
    kdfParams: {
      saltB64: "synthetic-salt",
      memoryKiB: 8192,
      iterations: 1,
      parallelism: 1,
    },
    vaultVersion: 1,
    createdAt: "2026-11-10T00:00:00.000Z",
  };
  mockCachedPrivateKey = key.privateKey.armor();
  await ensureVaultLoaded({} as MailRuntime); // The encryption adapter does not use runtime transport fields.
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
  activateSessionData("synthetic-user");
  jest.mocked(openpgp.readKey).mockImplementation(actualOpenPgp.readKey);
  clearVaultCache();
  await loadKey(getKey(0));
});

afterEach(() => {
  jest.restoreAllMocks();
  clearVaultCache();
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
  if (!attachment?.content || typeof attachment.content === "string") {
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
    clearVaultCache();
    if (switchAccount) await loadKey(getKey(2));
    resume?.();
    await rejection;
  },
);

it("rejects a production native sealer retained across clear/reload of the same key", async () => {
  const { createMailSealer } = await import("./outgoing-message-crypto");
  const sealer = await createMailSealer({} as MailRuntime); // Rejection must occur before a transport field is used.
  clearVaultCache();
  await loadKey(getKey(0));
  await expect(sealer.encrypt({ plaintext: TEXT, recipientPublicKeysArmored: [getKey(0).publicKey.armor()] })).rejects.toThrow("session changed");
  await expect(sealer.upload("SYNTHETIC")).rejects.toThrow("session changed");
});

it("invalidates a production native sealer synchronously when the session suspends", async () => {
  const { createMailSealer } = await import("./outgoing-message-crypto");
  const sealer = await createMailSealer({} as MailRuntime); // Rejection must occur before a transport field is used.
  suspendSessionData();
  expect(sealer.isCurrent()).toBe(false);
  await expect(sealer.encrypt({ plaintext: TEXT, recipientPublicKeysArmored: [getKey(0).publicKey.armor()] })).rejects.toThrow("session changed");
  await expect(sealer.upload("SYNTHETIC")).rejects.toThrow("session changed");
});

it("rejects native verification that completes after the vault is cleared and reloaded", async () => {
  const { armoredMessage } = await encryptForRecipients({ plaintext: TEXT, recipientPublicKeysArmored: [getKey(0).publicKey.armor()] });
  let resume: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const paused = new Promise<void>((resolve) => { resume = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  jest.mocked(openpgp.readKey).mockImplementation(async (input) => {
    entered?.();
    await paused;
    return "armoredKey" in input ? actualOpenPgp.readKey(input) : actualOpenPgp.readKey(input);
  });
  const result = decryptMailMessage({} as MailRuntime, "synthetic-message", armoredMessage, getKey(0).publicKey.armor());
  const rejection = expect(result).rejects.toThrow("session changed");
  await started;
  clearVaultCache();
  await loadKey(getKey(0));
  resume?.();
  await rejection;
});
