import { beforeEach, expect, it, jest } from "@jest/globals";
import { activateSessionData } from "@workspace/native-core/lib/session-data-lifecycle";
import {
  clearVaultCache,
  decryptMailMessage,
  decryptPgpMimeMessage,
  ensureVaultLoaded,
} from "./mail-crypto";
import type { UserKeyVault } from "./native-vault-crypto";
import type { MailRuntime } from "./mail-runtime";
import { resolveSenderVerificationKey, clearSenderKeyCache } from "./mail-sender-key";
import { StalwartJmapClient } from "./jmap-client";
import { resolveMailServerPolicy, signOutgoingMailContent } from "@workspace/calendar-core";
import * as openpgp from "openpgp";
import { createMailSealer } from "./outgoing-message-crypto";
import { loadStalwart110MailFixtures } from "../../../../../packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/fixture-loader";

const fixtures = loadStalwart110MailFixtures();
let mockVault: UserKeyVault | null = null;
let mockCachedPrivateKey = "";
let mockCiphertext = "";
const mockRecipientLookup = jest.fn<() => Promise<{ publicKeyArmored: string }>>();

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
  getRecipientKey: () => mockRecipientLookup(),
  mailFetch: async () => ({
    ok: true,
    json: async () => ({
      email: "fixture@solace.test",
      vaultVersion: 1,
      encryptedVaultB64: "SYNTHETIC-vault-boundary",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "synthetic-salt",
        memoryKiB: 8192,
        iterations: 1,
        parallelism: 1,
      },
      wrappedSecret: "SYNTHETIC-wrapped-secret",
    }),
  }),
  upsertAccountVaultBackup: jest.fn(),
}));
jest.mock("./vault-secret", () => ({
  unwrapVaultSecret: async () => "SYNTHETIC-secret",
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

const client = new StalwartJmapClient({
  baseUrl: "https://mail.example.test",
  accessToken: "SYNTHETIC-NOT-A-TOKEN",
  fetcher: async () => {
    throw new Error("Corpus tests never use network transport");
  },
});
jest
  .spyOn(client, "getBlobAsText")
  .mockImplementation(async () => mockCiphertext);
const runtime: MailRuntime = {
  config: {
    defaultDomain: "solace.test",
    discoveryBaseUrl: "https://mail.example.test",
    signupEnabled: true,
    oauth: { mailTokenEndpoint: "/synthetic-mail-token" },
  },
  client,
  session: {
    accounts: {},
    primaryAccounts: {},
    apiUrl: "https://mail.example.test/jmap/",
  },
  accountId: "synthetic-account",
  mailboxes: [],
  identities: [],
  pickerIdentities: [],
  encryptedAtRest: true,
  mailServerPolicy: resolveMailServerPolicy({}),
};

async function loadKey(name: string) {
  clearVaultCache();
  const key = fixtures.keyFor(name);
  mockVault = {
    userId: "synthetic-user",
    email: key.email,
    publicKeyArmored: key.publicKeyArmored,
    publicKeyFingerprint: key.fingerprint,
    encryptedPrivateKeyArmored: key.privateKeyArmored,
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
  mockCachedPrivateKey = key.privateKeyArmored;
  await ensureVaultLoaded(runtime);
}

beforeEach(() => {
  activateSessionData("synthetic-user");
  clearVaultCache();
});

it.each(fixtures.records)(
  "opens target-produced mail through actual native decrypt/MIME code: $name",
  async (record) => {
    await loadKey(record.owner);
    mockCiphertext = fixtures.readCiphertext(record);
    const senderKey = fixtures.keyFor("sender").publicKeyArmored;
    const result = record.topContentType.startsWith("multipart/encrypted")
      ? await decryptPgpMimeMessage(
          runtime,
          record.message.id,
          record.message.bodyStructure,
          senderKey,
        )
      : await decryptMailMessage(
          runtime,
          record.message.id,
          mockCiphertext,
          senderKey,
        );
    expect(result.signatureVerificationState).toBe(record.expectedSignature);
    expect(result.signatureVerificationLayers).toHaveLength(
      record.expectedLayers,
    );
    if (record.name === "ecc-structured") {
      expect(result.signatureVerificationLayers).toEqual([
        "not_signed",
        "verified",
      ]);
    }
    if (!record.usable) {
      expect(result.plaintext).not.toBe(fixtures.expected.text);
      expect(result.html).toBeNull();
      expect(result.attachments).toHaveLength(2);
      return;
    }
    expect(result.plaintext).toBe(fixtures.expected.text);
    expect(result.html).toBe(fixtures.expected.html);
    const attachment = result.attachments?.[0];
    if (!attachment?.content || typeof attachment.content === "string")
      throw new Error("Synthetic attachment bytes missing");
    expect(attachment.name).toBe("synthetic-notes.txt");
    expect(new TextDecoder().decode(new Uint8Array(attachment.content))).toBe(
      fixtures.expected.attachmentText,
    );
  },
);

it("rejects unrelated keys and corrupted target packets in the actual native decryptor", async () => {
  const record = fixtures.records.find(
    (candidate) => candidate.name === "ecc-inbound",
  );
  if (!record) throw new Error("Inbound fixture missing");
  mockCiphertext = fixtures.readCiphertext(record);
  await loadKey("unrelated");
  await expect(
    decryptPgpMimeMessage(
      runtime,
      record.message.id,
      record.message.bodyStructure,
    ),
  ).rejects.toThrow();
  await loadKey("ecc");
  mockCiphertext = mockCiphertext.replace(
    /[A-Za-z0-9+/]{60}/,
    (line) => `${line[0] === "A" ? "B" : "A"}${line.slice(1)}`,
  );
  await expect(
    decryptPgpMimeMessage(
      runtime,
      record.message.id,
      record.message.bodyStructure,
    ),
  ).rejects.toThrow();
});

it("verifies own primary and alias signatures locally despite a foreign directory key", async () => {
  await loadKey("sender");
  clearSenderKeyCache();
  mockRecipientLookup.mockReset().mockResolvedValue({ publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored });
  const sender = fixtures.keyFor("sender");
  const ownRuntime: MailRuntime = {
    ...runtime,
    session: { ...runtime.session, username: sender.email },
    identities: [{ id: "synthetic-alias", email: "alias@custom.test", name: "Synthetic" }],
  };
  const record = fixtures.records.find((candidate) => candidate.name === "sender-structured");
  if (!record) throw new Error("Own-message fixture missing");
  mockCiphertext = fixtures.readCiphertext(record);
  for (const email of [sender.email, " Alias@Custom.Test "]) {
    const key = await resolveSenderVerificationKey(ownRuntime, email);
    const result = await decryptPgpMimeMessage(ownRuntime, record.message.id, record.message.bodyStructure, key);
    expect(result.signatureVerificationState).toBe("verified");
  }
  expect(mockRecipientLookup).not.toHaveBeenCalled();
  const foreignRuntime = { ...ownRuntime, config: { ...ownRuntime.config, defaultDomain: "mime-probe-6e3bc9.solace.test" } };
  const foreignKey = await resolveSenderVerificationKey(foreignRuntime, fixtures.keyFor("unrelated").email);
  expect(foreignKey).toBe(fixtures.keyFor("unrelated").publicKeyArmored);
  expect(mockRecipientLookup).toHaveBeenCalledTimes(1);
  const foreignResult = await decryptPgpMimeMessage(foreignRuntime, record.message.id, record.message.bodyStructure, foreignKey);
  expect(foreignResult.signatureVerificationState).toBe("failed");
});

it("signs outside mail with the native vault key and verifies it after at-rest encryption", async () => {
  await loadKey("sender");
  const sender = fixtures.keyFor("sender");
  const entity = await signOutgoingMailContent({ text: "Signed body" }, await createMailSealer(runtime));
  const sealAtRest = async (plaintext: string) =>
    openpgp.encrypt({
      message: await openpgp.createMessage({ text: plaintext }),
      encryptionKeys: await openpgp.readKey({ armoredKey: sender.publicKeyArmored }),
      format: "armored",
    });
  const open = async (plaintext: string, senderKey: string | undefined, senderEmail: string) =>
    decryptMailMessage(runtime, "signed", await sealAtRest(plaintext), senderKey, undefined, senderEmail);

  const verified = await open(entity, sender.publicKeyArmored, sender.email);
  expect(verified.signatureVerificationState).toBe("verified");
  expect(verified.plaintext).toBe("Signed body");
  expect((await open(entity, undefined, sender.email)).signatureVerificationState).toBe("attached_key");
  expect((await open(entity, undefined, "someone@outside.test")).signatureVerificationState).toBe("unverified");
  const tampered = entity.replace("Content-Type: text/plain; charset=utf-8", "Content-Type: text/plain; charset=us-ascii");
  expect((await open(tampered, sender.publicKeyArmored, sender.email)).signatureVerificationState).toBe("failed");
});
