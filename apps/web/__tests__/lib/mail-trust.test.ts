import {
  getMailReadLimitNotice,
  MAX_MAIL_MIME_HEADER_BYTES,
} from "@workspace/calendar-core/mail-mime-limits";
import {
  afterAll,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as openpgp from "openpgp";
import { QueryClient } from "@tanstack/react-query";
import { StalwartJmapClient } from "@/lib/mail/jmap-client";
import {
  resolveOutgoingMessageBody,
  type ActiveMailboxState,
} from "@/lib/mail/mail-app-helpers";
import { resolveMailServerPolicy } from "@workspace/calendar-core";
import { decryptMessageForCompose } from "@/lib/mail/decrypt-message-for-compose";
import { MailCryptoWorkerClient } from "@/lib/mail/worker-client-core";
import {
  getActiveE2eeSession,
  setActiveE2eeSession,
  clearActiveE2eeSession,
} from "@/lib/e2ee-session";
import { decryptJsonPayload } from "@/lib/e2ee-crypto";
import { parseEncryptedJsonPayload } from "@workspace/e2ee";
import { loadStalwart110MailFixtures } from "../../../../packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/fixture-loader";

jest.mock("@workspace/calendar-core", () => ({
  ...jest.requireActual<typeof import("@workspace/calendar-core")>(
    "@workspace/calendar-core",
  ),
  MAIL_KEY_CONTINUITY_ENABLED: true,
}));
let mockClient: MailCryptoWorkerClient;
let mockCiphertext: string | null = null;
let mockAnchor: string | null = null;
const mockDirectory =
  jest.fn<() => Promise<{ publicKeyArmored: string; fingerprint: string }>>();
const mockRead = jest.fn(async () => ({ encryptedTrust: mockCiphertext }));
const mockWrite = jest.fn(
  async (
    _path: string,
    body: { encryptedTrust: string; expectedEncryptedTrust: string | null },
  ) => {
    if (mockCiphertext !== body.expectedEncryptedTrust)
      throw { statusCode: 409 };
    mockCiphertext = body.encryptedTrust;
    return { encryptedTrust: mockCiphertext };
  },
);
jest.mock("@/lib/api-clients", () => ({
  httpClient: {
    get: (...args: Parameters<typeof mockRead>) => mockRead(...args),
    put: (...args: Parameters<typeof mockWrite>) => mockWrite(...args),
  },
}));
jest.mock("@/lib/mail/api-service", () => ({
  mailDemoApiService: { getRecipientKey: () => mockDirectory() },
}));
jest.mock("@/lib/mail/mail-trust-anchor-storage", () => ({
  readMailTrustAnchor: async () => mockAnchor,
  writeMailTrustAnchor: async (_id: string, value: string) => {
    mockAnchor = value;
  },
}));
jest.mock("@/lib/mail/worker-client", () => ({
  mailCryptoWorkerClient: {
    getVerificationContext: () => mockClient.getVerificationContext(),
    decryptMessage: (
      ...args: Parameters<MailCryptoWorkerClient["decryptMessage"]>
    ) => mockClient.decryptMessage(...args),
    isVerificationContextCurrent: (
      ...args: Parameters<
        MailCryptoWorkerClient["isVerificationContextCurrent"]
      >
    ) => mockClient.isVerificationContextCurrent(...args),
    inspectPublicKey: (
      ...args: Parameters<MailCryptoWorkerClient["inspectPublicKey"]>
    ) => mockClient.inspectPublicKey(...args),
    encryptForRecipients: (
      ...args: Parameters<MailCryptoWorkerClient["encryptForRecipients"]>
    ) => mockClient.encryptForRecipients(...args),
  },
}));

import {
  configureMailTrustQueryClient,
  resolveTrustedMailRecipient,
  mailTrustReviewBridge,
} from "@/lib/mail/mail-trust";
import {
  resolveMailSenderVerification,
  resolveMailSenderVerificationKey,
} from "@/lib/mail/mail-sender-verification";

const fixtures = loadStalwart110MailFixtures();
const originalSelf = Object.getOwnPropertyDescriptor(globalThis, "self");
const owners = new Map<number, InProcessWorker>();
const scope: {
  onmessage:
    | ((event: {
        data: { requestId: number; type: string; payload?: unknown };
      }) => Promise<void>)
    | null;
  postMessage: (result: {
    requestId: number;
    error?: string;
    payload?: unknown;
  }) => void;
} = {
  onmessage: null,
  postMessage: (result) => {
    const owner = owners.get(result.requestId);
    owners.delete(result.requestId);
    owner?.onmessage?.call(
      owner,
      new MessageEvent("message", { data: result }),
    );
  },
};
class InProcessWorker extends EventTarget implements Worker {
  onmessage: Worker["onmessage"] = null;
  onmessageerror: Worker["onmessageerror"] = null;
  onerror: Worker["onerror"] = null;
  terminate() {}
  postMessage(request: { requestId: number; type: string; payload?: unknown }) {
    const handler = scope.onmessage;
    if (!handler) throw new Error("Actual worker handler unavailable");
    owners.set(request.requestId, this);
    handler({ data: request }).catch(() =>
      this.onmessageerror?.call(this, new MessageEvent("messageerror")),
    );
  }
}
let queries: QueryClient;
function context() {
  const current = mockClient.getVerificationContext();
  if (!current) throw new Error("Synthetic vault missing");
  return current;
}
async function opened() {
  const session = getActiveE2eeSession();
  if (!mockCiphertext) throw new Error("Expected real account ciphertext");
  const payload = parseEncryptedJsonPayload(mockCiphertext.slice(4));
  if (!session || !payload) throw new Error("Expected real account ciphertext");
  return decryptJsonPayload<unknown>(
    session.accountKey,
    payload,
    `mail-trust:v1:${session.userId}`,
  );
}
beforeAll(async () => {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: scope,
  });
  await import("@/workers/mail-crypto.worker");
});
beforeEach(async () => {
  clearActiveE2eeSession();
  mockCiphertext = null;
  mockAnchor = null;
  owners.clear();
  mockDirectory.mockReset();
  mockRead.mockClear();
  mockWrite.mockClear();
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
    activatedAt: new Date(),
  });
  queries = new QueryClient();
  configureMailTrustQueryClient(queries);
  mockClient = new MailCryptoWorkerClient(() => new InProcessWorker());
  const key = fixtures.keyFor("ecc");
  const privateKey = await openpgp.encryptKey({
    privateKey: await openpgp.readPrivateKey({
      armoredKey: key.privateKeyArmored,
    }),
    passphrase: "SYNTHETIC",
  });
  await mockClient.loadVault({
    ownerUserId: "synthetic-user",
    publicKeyArmored: key.publicKeyArmored,
    privateKeyArmored: privateKey.armor(),
    privateKeyPassphrase: "SYNTHETIC",
    ownAddresses: [key.email, "alias@custom.test"],
  });
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("sender").publicKeyArmored,
    fingerprint: fixtures.keyFor("unrelated").fingerprint,
  });
});
afterAll(async () => {
  queries.clear();
  await mockClient.clear();
  clearActiveE2eeSession();
  if (originalSelf) Object.defineProperty(globalThis, "self", originalSelf);
  else Reflect.deleteProperty(globalThis, "self");
});

it("establishes a parsed primary pin before releasing a web send key and ignores the directory fingerprint", async () => {
  const sender = fixtures.keyFor("sender");
  const result = await resolveTrustedMailRecipient(sender.email, context());
  expect((await openpgp.readKey({ armoredKey: result })).getFingerprint()).toBe(
    sender.fingerprint.toLowerCase(),
  );
  expect(await opened()).toMatchObject({
    version: 1,
    pins: [
      { email: sender.email, fingerprint: sender.fingerprint.toUpperCase() },
    ],
  });
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockCiphertext).not.toContain(sender.email);
  expect(mockAnchor).not.toContain("established");
});
it("verifies received mail with the retained pin despite directory substitution and never establishes a pin by reading", async () => {
  const sender = fixtures.keyFor("sender");
  const unseen = await resolveMailSenderVerificationKey({
    senderEmail: sender.email,
    internalDomain: "mime-probe-6e3bc9.solace.test",
    context: context(),
  });
  expect(unseen).toBeUndefined();
  expect(mockDirectory).not.toHaveBeenCalled();
  expect(mockWrite).not.toHaveBeenCalled();
  await resolveTrustedMailRecipient(sender.email, context());
  mockDirectory.mockClear();
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    fingerprint: "forged",
  });
  const verification = await resolveMailSenderVerification({
    senderEmail: sender.email,
    internalDomain: "mime-probe-6e3bc9.solace.test",
    context: context(),
  });
  const record = fixtures.records.find(
    (item) => item.name === "ecc-structured",
  );
  if (!record) throw new Error("Synthetic record missing");
  const result = await mockClient.decryptMessage({
    armoredMessage: fixtures.readCiphertext(record),
    senderPublicKeyArmored: verification.senderPublicKeyArmored,
    expectedVaultFingerprint: context().fingerprint,
  });
  expect(result.signatureVerificationState).toBe("verified");
  expect(mockDirectory).toHaveBeenCalledTimes(1);
  expect(verification.senderKeyTrustState).toMatchObject({
    kind: "key_changed",
    oldFingerprint: sender.fingerprint.toUpperCase(),
    newFingerprint: fixtures.keyFor("unrelated").fingerprint.toUpperCase(),
  });
  expect(mockWrite).toHaveBeenCalledTimes(1);
});
it("keeps the pin when a replacement is cancelled and conditionally commits explicit approval", async () => {
  const sender = fixtures.keyFor("sender");
  await resolveTrustedMailRecipient(sender.email, context());
  const saved = mockCiphertext;
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    fingerprint: sender.fingerprint,
  });
  let unsubscribe = mailTrustReviewBridge.subscribe(async () => "cancel");
  await expect(
    resolveTrustedMailRecipient(sender.email, context()),
  ).rejects.toMatchObject({ problem: { kind: "changed" } });
  expect(mockCiphertext).toBe(saved);
  unsubscribe();
  unsubscribe = mailTrustReviewBridge.subscribe(async (problem) => {
    expect(problem).toMatchObject({
      kind: "changed",
      oldFingerprint: sender.fingerprint.toUpperCase(),
      newFingerprint: fixtures.keyFor("unrelated").fingerprint.toUpperCase(),
    });
    return "approve";
  });
  await resolveTrustedMailRecipient(sender.email, context());
  unsubscribe();
  expect(await opened()).toMatchObject({
    pins: [
      { fingerprint: fixtures.keyFor("unrelated").fingerprint.toUpperCase() },
    ],
  });
});
it("rejects a delayed directory response after its account ends", async () => {
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
    fixtures.keyFor("sender").email,
    context(),
  );
  const rejected = expect(result).rejects.toThrow("session changed");
  await started;
  clearActiveE2eeSession();
  await mockClient.clear();
  resume?.({
    publicKeyArmored: fixtures.keyFor("sender").publicKeyArmored,
    fingerprint: "forged",
  });
  await rejected;
  expect(mockWrite).not.toHaveBeenCalled();
});
it("uses the local own-alias key without directory or trust-store writes", async () => {
  const key = await resolveTrustedMailRecipient(
    " Alias@Custom.Test ",
    context(),
  );
  expect((await openpgp.readKey({ armoredKey: key })).getFingerprint()).toBe(
    fixtures.keyFor("ecc").fingerprint.toLowerCase(),
  );
  expect(mockDirectory).not.toHaveBeenCalled();
  expect(mockWrite).not.toHaveBeenCalled();
});

function mailbox(): ActiveMailboxState {
  const key = fixtures.keyFor("ecc");
  return {
    client: new StalwartJmapClient({
      baseUrl: "https://mail.example.test",
      accessToken: "SYNTHETIC",
      fetcher: async () => {
        throw new Error("No network in synthetic crypto tests");
      },
    }),
    session: {
      accounts: {},
      primaryAccounts: {},
      apiUrl: "https://mail.example.test/jmap/",
    },
    mailboxes: [],
    identities: [],
    pickerIdentities: [],
    messages: [],
    selectedMailboxId: null,
    email: key.email,
    accountEncryptedAtRest: true,
    mailServerPolicy: resolveMailServerPolicy({}),
    unlockedVault: {
      userId: "synthetic-user",
      email: key.email,
      publicKeyArmored: key.publicKeyArmored,
      publicKeyFingerprint: key.fingerprint,
      encryptedPrivateKeyArmored: key.privateKeyArmored,
      kdf: "argon2id",
      kdfParams: {
        saltB64: "SYNTHETIC",
        memoryKiB: 8192,
        iterations: 1,
        parallelism: 1,
      },
      vaultVersion: 1,
      createdAt: "2026-11-10T00:00:00.000Z",
    },
  };
}
it("the production web sealer commits continuity before real anonymous encryption starts", async () => {
  const own = mailbox();
  const original = mockClient.encryptForRecipients.bind(mockClient);
  const encrypt = jest
    .spyOn(mockClient, "encryptForRecipients")
    .mockImplementation(async (input) => {
      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(mockCiphertext?.startsWith("mt1.")).toBe(true);
      return original(input);
    });
  const result = await resolveOutgoingMessageBody({
    activeMailbox: own,
    recipients: [fixtures.keyFor("sender").email],
    plaintext: "SYNTHETIC pipeline body",
    internalDomain: "mime-probe-6e3bc9.solace.test",
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
  expect(String(opened.data)).toContain("SYNTHETIC pipeline body");
  await expect(opened.signatures[0]?.verified).resolves.toBe(true);
});
it("a cancelled replacement never reaches production web encryption or plaintext attachment upload", async () => {
  const own = mailbox();
  await resolveTrustedMailRecipient(fixtures.keyFor("sender").email, context());
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    fingerprint: "forged",
  });
  const unsubscribe = mailTrustReviewBridge.subscribe(async () => "cancel");
  const encrypt = jest.spyOn(mockClient, "encryptForRecipients");
  const upload = jest.spyOn(own.client, "uploadTextBlob");
  await expect(
    resolveOutgoingMessageBody({
      activeMailbox: own,
      recipients: [fixtures.keyFor("sender").email],
      plaintext: "SYNTHETIC",
      internalDomain: "mime-probe-6e3bc9.solace.test",
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
});

it("a forged current directory signature cannot verify against a retained web pin", async () => {
  const sender = fixtures.keyFor("sender");
  await resolveTrustedMailRecipient(sender.email, context());
  mockDirectory.mockResolvedValue({
    publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    fingerprint: sender.fingerprint,
  });
  const verification = await resolveMailSenderVerification({
    senderEmail: sender.email,
    internalDomain: "mime-probe-6e3bc9.solace.test",
    context: context(),
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
  const decrypted = await mockClient.decryptMessage({
    armoredMessage,
    senderPublicKeyArmored: verification.senderPublicKeyArmored,
  });
  expect(decrypted.signatureVerificationState).toBe("failed");
  expect(verification.senderKeyTrustState?.kind).toBe("key_changed");
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

it("refuses real encrypted oversized MIME headers through the compose reader without returning raw content", async () => {
  const own = mailbox();
  const sender = fixtures.keyFor("sender");
  await resolveTrustedMailRecipient(sender.email, context());
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
  jest.spyOn(own.client, "getBlobAsText").mockResolvedValue(armored);
  const record = fixtures.records.find(
    (item) => item.name === "ecc-structured",
  );
  if (!record) throw new Error("Synthetic record missing");
  const read = decryptMessageForCompose({
    client: own.client,
    session: own.session,
    message: {
      id: "synthetic-overlimit",
      from: [{ email: sender.email }],
      bodyStructure: record.message.bodyStructure,
    },
    config: {
      defaultDomain: "mime-probe-6e3bc9.solace.test",
      discoveryBaseUrl: "https://mail.example.test",
      signupEnabled: true,
      oauth: { mailTokenEndpoint: "/synthetic" },
    },
  });
  await expect(read).rejects.toBeInstanceOf(Error);
  const error = await read.catch((value: unknown) => value);
  expect(getMailReadLimitNotice(error)).toBe(
    "This message is too large or complex to open here.",
  );
});
