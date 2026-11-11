import { afterAll, beforeEach, expect, it, jest } from "@jest/globals";
import {
  getMailReadLimitNotice,
  MAX_MAIL_MIME_HEADER_BYTES,
} from "@workspace/calendar-core/mail-mime-limits";
import * as openpgp from "openpgp";
import {
  activateSessionData,
  closeSessionData,
  suspendSessionData,
  captureSessionDataScope,
  isSessionDataScopeCurrent,
} from "@workspace/native-core/lib/session-data-lifecycle";
import { setActiveE2eeSession } from "@workspace/native-core/lib/e2ee-session";
import { queryClient } from "@workspace/native-core/providers/QueryProvider";
import { resolveMailServerPolicy } from "@workspace/calendar-core";
import { StalwartJmapClient } from "./jmap-client";
import * as mailCrypto from "./mail-crypto";
import { resolveOutgoingMessageBody } from "./outgoing-message-crypto";
import {
  clearVaultCache,
  ensureVaultLoaded,
  decryptPgpMimeMessage,
} from "./mail-crypto";
import {
  clearSenderKeyCache,
  resolveSenderVerification,
  resolveSenderVerificationKey,
  decryptEncryptedMessage,
} from "./mail-sender-key";
import {
  resolveTrustedMailRecipient,
  mailTrustReviewBridge,
} from "./mail-trust";
import type { UserKeyVault } from "./native-vault-crypto";
import type { MailRuntime } from "./mail-runtime";
import { loadStalwart110MailFixtures } from "../../../../../packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/fixture-loader";

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("@workspace/calendar-core", () => ({
  ...jest.requireActual<typeof import("@workspace/calendar-core")>(
    "@workspace/calendar-core",
  ),
  MAIL_KEY_CONTINUITY_ENABLED: true,
}));
let mockVault: UserKeyVault;
let mockCachedPrivateKey = "";
let mockServerCiphertext: string | null = null;
let mockAnchor: string | null = null;
let mockCiphertext = "";
const mockDirectory =
  jest.fn<() => Promise<{ publicKeyArmored: string; fingerprint: string }>>();
const mockWrite = jest.fn(
  async (
    _path: string,
    body: { encryptedTrust: string; expectedEncryptedTrust: string | null },
  ) => {
    if (mockServerCiphertext !== body.expectedEncryptedTrust)
      throw { statusCode: 409 };
    mockServerCiphertext = body.encryptedTrust;
    return { encryptedTrust: mockServerCiphertext };
  },
);
jest.mock("@workspace/native-core/lib/api", () => ({
  httpClient: {
    get: async () => ({ encryptedTrust: mockServerCiphertext }),
    put: (...args: Parameters<typeof mockWrite>) => mockWrite(...args),
  },
}));
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
  SECURE_STORE_KEYS: {
    MAIL_TRUST_ESTABLISHMENT: "SYNTHETIC-mail-trust-anchor",
  },
}));
jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "SYNTHETIC-this-device-only",
  getItemAsync: async () => mockAnchor,
  setItemAsync: async (_key: string, value: string) => {
    mockAnchor = value;
  },
  deleteItemAsync: async () => {
    mockAnchor = null;
  },
}));
jest.mock("./mail-api", () => ({
  getRecipientKey: () => mockDirectory(),
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
  unlockEncryptedMailVault: async () => mockVault,
  createEncryptedMailVault: jest.fn(),
}));
jest.mock("./mail-password-cache", () => ({
  loadCachedPrivateKey: async () => mockCachedPrivateKey,
  saveCachedPrivateKey: jest.fn(),
}));

const fixtures = loadStalwart110MailFixtures();
const client = new StalwartJmapClient({
  baseUrl: "https://mail.example.test",
  accessToken: "SYNTHETIC",
  fetcher: async () => {
    throw new Error("No network is allowed in synthetic trust tests");
  },
});
jest
  .spyOn(client, "getBlobAsText")
  .mockImplementation(async () => mockCiphertext);
const runtime: MailRuntime = {
  config: {
    defaultDomain: "mime-probe-6e3bc9.solace.test",
    discoveryBaseUrl: "https://mail.example.test",
    signupEnabled: true,
    oauth: { mailTokenEndpoint: "/synthetic" },
  },
  client,
  session: {
    accounts: {},
    primaryAccounts: {},
    apiUrl: "https://mail.example.test/jmap/",
    username: fixtures.keyFor("ecc").email,
  },
  accountId: "synthetic-account",
  identities: [
    {
      id: "synthetic-primary",
      email: fixtures.keyFor("ecc").email,
      name: "Synthetic",
    },
    { id: "synthetic-alias", email: "alias@custom.test", name: "Synthetic" },
  ],
  pickerIdentities: [],
  mailboxes: [],
  encryptedAtRest: true,
  mailServerPolicy: resolveMailServerPolicy({}),
};
function current() {
  const scope = captureSessionDataScope("synthetic-user");
  return () => isSessionDataScopeCurrent(scope);
}
beforeEach(async () => {
  await closeSessionData();
  activateSessionData("synthetic-user");
  clearVaultCache();
  clearSenderKeyCache();
  queryClient.clear();
  mockServerCiphertext = null;
  mockAnchor = null;
  mockWrite.mockClear();
  mockDirectory.mockReset();
  const key = fixtures.keyFor("ecc");
  mockVault = {
    userId: "synthetic-user",
    email: key.email,
    publicKeyArmored: key.publicKeyArmored,
    publicKeyFingerprint: key.fingerprint,
    encryptedPrivateKeyArmored: key.privateKeyArmored,
    kdf: "argon2id",
    kdfParams: {
      saltB64: "synthetic",
      memoryKiB: 8192,
      iterations: 1,
      parallelism: 1,
    },
    vaultVersion: 1,
    createdAt: "2026-11-10T00:00:00.000Z",
  };
  mockCachedPrivateKey = key.privateKeyArmored;
  const accountKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  setActiveE2eeSession({
    userId: "synthetic-user",
    deviceId: "synthetic-device",
    accountKey,
    blindIndexKey: accountKey,
  });
  await ensureVaultLoaded(runtime);
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("sender").publicKeyArmored,
    fingerprint: fixtures.keyFor("unrelated").fingerprint,
  });
});
it("commits an opaque native pin derived from the actual key rather than the directory fingerprint", async () => {
  const sender = fixtures.keyFor("sender");
  const result = await resolveTrustedMailRecipient(
    runtime,
    sender.email,
    current(),
  );
  expect((await openpgp.readKey({ armoredKey: result })).getFingerprint()).toBe(
    sender.fingerprint.toLowerCase(),
  );
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockServerCiphertext).not.toContain(sender.email);
  expect(mockAnchor).not.toContain("established");
});
it("native reading never establishes trust and verifies from the existing pin despite a substituted directory", async () => {
  const sender = fixtures.keyFor("sender");
  expect(
    await resolveSenderVerificationKey(runtime, sender.email),
  ).toBeUndefined();
  expect(mockDirectory).not.toHaveBeenCalled();
  expect(mockWrite).not.toHaveBeenCalled();
  await resolveTrustedMailRecipient(runtime, sender.email, current());
  mockDirectory.mockClear();
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    fingerprint: "forged",
  });
  const verification = await resolveSenderVerification(runtime, sender.email);
  const key = verification.senderPublicKeyArmored;
  const record = fixtures.records.find(
    (item) => item.name === "ecc-structured",
  );
  if (!record) throw new Error("Synthetic fixture missing");
  mockCiphertext = fixtures.readCiphertext(record);
  const result = await decryptPgpMimeMessage(
    runtime,
    record.message.id,
    record.message.bodyStructure,
    key,
  );
  expect(result.signatureVerificationState).toBe("verified");
  expect(mockDirectory).toHaveBeenCalledTimes(1);
  expect(verification.senderKeyTrustState?.kind).toBe("key_changed");
  expect(mockWrite).toHaveBeenCalledTimes(1);
});
it("keeps a native pin on cancellation and commits only explicit reviewed replacement", async () => {
  const sender = fixtures.keyFor("sender");
  await resolveTrustedMailRecipient(runtime, sender.email, current());
  const saved = mockServerCiphertext;
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    fingerprint: "forged",
  });
  let unsubscribe = mailTrustReviewBridge.subscribe(async () => "cancel");
  await expect(
    resolveTrustedMailRecipient(runtime, sender.email, current()),
  ).rejects.toMatchObject({ problem: { kind: "changed" } });
  expect(mockServerCiphertext).toBe(saved);
  unsubscribe();
  unsubscribe = mailTrustReviewBridge.subscribe(async () => "approve");
  const approved = await resolveTrustedMailRecipient(
    runtime,
    sender.email,
    current(),
  );
  unsubscribe();
  expect(
    (await openpgp.readKey({ armoredKey: approved })).getFingerprint(),
  ).toBe(fixtures.keyFor("unrelated").fingerprint.toLowerCase());
});
it("invalidates native pending lookups synchronously when the account suspends", async () => {
  let entered: (() => void) | undefined;
  let resume:
    | ((key: { publicKeyArmored: string; fingerprint: string }) => void)
    | undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  mockDirectory.mockImplementationOnce(() => {
    entered?.();
    return new Promise((resolve) => {
      resume = resolve;
    });
  });
  const result = resolveTrustedMailRecipient(
    runtime,
    fixtures.keyFor("sender").email,
    current(),
  );
  const rejected = expect(result).rejects.toThrow("session changed");
  await started;
  suspendSessionData();
  resume?.({
    publicKeyArmored: fixtures.keyFor("sender").publicKeyArmored,
    fingerprint: "forged",
  });
  await rejected;
  expect(mockWrite).not.toHaveBeenCalled();
});
it("resolves an own alias locally without directory or trust writes", async () => {
  const key = await resolveTrustedMailRecipient(
    runtime,
    " ALIAS@CUSTOM.TEST ",
    current(),
  );
  expect((await openpgp.readKey({ armoredKey: key })).getFingerprint()).toBe(
    fixtures.keyFor("ecc").fingerprint.toLowerCase(),
  );
  expect(mockDirectory).not.toHaveBeenCalled();
  expect(mockWrite).not.toHaveBeenCalled();
});

it("the production native sealer waits for continuity before real anonymous encryption", async () => {
  const original = mailCrypto.encryptForRecipients;
  const encrypt = jest
    .spyOn(mailCrypto, "encryptForRecipients")
    .mockImplementation(async (input) => {
      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(mockServerCiphertext?.startsWith("mt1.")).toBe(true);
      return original(input);
    });
  const result = await resolveOutgoingMessageBody({
    runtime,
    recipients: [fixtures.keyFor("sender").email],
    plaintext: "SYNTHETIC native pipeline",
  });
  expect(result.kind).toBe("inline");
  expect(encrypt).toHaveBeenCalledTimes(1);
  const encrypted = await openpgp.readMessage({
    armoredMessage: result.textBody,
  });
  expect(
    encrypted
      .getEncryptionKeyIDs()
      .every((id) => id.toHex() === "0000000000000000"),
  ).toBe(true);
  const opened = await openpgp.decrypt({
    message: encrypted,
    decryptionKeys: await openpgp.readPrivateKey({
      armoredKey: fixtures.keyFor("sender").privateKeyArmored,
    }),
    verificationKeys: await openpgp.readKey({
      armoredKey: fixtures.keyFor("ecc").publicKeyArmored,
    }),
  });
  expect(String(opened.data)).toContain("SYNTHETIC native pipeline");
  await expect(opened.signatures[0]?.verified).resolves.toBe(true);
  encrypt.mockRestore();
});
it("a cancelled native replacement reaches neither encryption nor plaintext upload", async () => {
  await resolveTrustedMailRecipient(
    runtime,
    fixtures.keyFor("sender").email,
    current(),
  );
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    fingerprint: "forged",
  });
  const unsubscribe = mailTrustReviewBridge.subscribe(async () => "cancel");
  const encrypt = jest.spyOn(mailCrypto, "encryptForRecipients");
  const upload = jest.spyOn(client, "uploadBlob");
  await expect(
    resolveOutgoingMessageBody({
      runtime,
      recipients: [fixtures.keyFor("sender").email],
      plaintext: "SYNTHETIC",
      mimeAttachments: [
        {
          filename: "synthetic.txt",
          contentType: "text/plain",
          content: new TextEncoder().encode("SYNTHETIC attachment"),
        },
      ],
    }),
  ).rejects.toMatchObject({ problem: { kind: "changed" } });
  unsubscribe();
  expect(encrypt).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  encrypt.mockRestore();
  upload.mockRestore();
});

afterAll(async () => {
  await closeSessionData();
  setActiveE2eeSession(null);
  queryClient.clear();
});

it("native read status distinguishes a changed directory and rejects its forged signature without pin writes", async () => {
  const sender = fixtures.keyFor("sender");
  await resolveTrustedMailRecipient(runtime, sender.email, current());
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    fingerprint: sender.fingerprint,
  });
  const armoredMessage = await openpgp.encrypt({
    message: await openpgp.createMessage({
      text: "SYNTHETIC forged directory signature",
    }),
    encryptionKeys: await openpgp.readKey({
      armoredKey: fixtures.keyFor("ecc").publicKeyArmored,
    }),
    signingKeys: await openpgp.readPrivateKey({
      armoredKey: fixtures.keyFor("unrelated").privateKeyArmored,
    }),
    format: "armored",
  });
  const result = await decryptEncryptedMessage(runtime, {
    id: "synthetic-forged",
    from: [{ email: sender.email }],
    textBody: [{ partId: "text" }],
    bodyValues: { text: { value: armoredMessage } },
  });
  expect(result.signatureVerificationState).toBe("failed");
  expect(result.senderKeyTrustState?.kind).toBe("key_changed");
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it("refuses real native oversized decrypted MIME headers instead of returning raw content", async () => {
  const sender = fixtures.keyFor("sender");
  await resolveTrustedMailRecipient(runtime, sender.email, current());
  const armored = await openpgp.encrypt({
    message: await openpgp.createMessage({
      text: `Content-Type: text/plain\r\nX-Synthetic: ${"x".repeat(MAX_MAIL_MIME_HEADER_BYTES + 1)}\r\n\r\nSYNTHETIC raw content must not render`,
    }),
    encryptionKeys: await openpgp.readKey({
      armoredKey: fixtures.keyFor("ecc").publicKeyArmored,
    }),
    signingKeys: await openpgp.readPrivateKey({
      armoredKey: sender.privateKeyArmored,
    }),
    format: "armored",
  });
  const read = decryptEncryptedMessage(runtime, {
    id: "synthetic-overlimit",
    from: [{ email: sender.email }],
    textBody: [{ partId: "text" }],
    bodyValues: { text: { value: armored } },
  });
  await expect(read).rejects.toBeInstanceOf(Error);
  const error = await read.catch((value: unknown) => value);
  expect(getMailReadLimitNotice(error)).toBe(
    "This message is too large or complex to open here.",
  );
});

it("reuses the native read-only sender directory cache without mutating trust", async () => {
  const sender = fixtures.keyFor("sender");
  await resolveTrustedMailRecipient(runtime, sender.email, current());
  mockDirectory.mockClear();
  const writes = mockWrite.mock.calls.length;
  await resolveSenderVerification(runtime, sender.email);
  await resolveSenderVerification(runtime, sender.email);
  expect(mockDirectory).toHaveBeenCalledTimes(1);
  expect(mockWrite).toHaveBeenCalledTimes(writes);
});
