import {
  afterAll,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as openpgp from "openpgp";
import { getMailDraftSizeError, MAX_MAIL_DISPLAY_CHARACTERS } from "@workspace/calendar-core/mail-mime-limits";
import { MailCryptoWorkerClient } from "@/lib/mail/worker-client-core";
import { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type {
  JmapEmailMessage,
  JmapSession,
  UserKeyVault,
} from "@/lib/mail/types";
import { loadStalwart110MailFixtures } from "../../../../packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/fixture-loader";

jest.mock("openpgp", () => {
  const actual = jest.requireActual<typeof import("openpgp")>("openpgp");
  return { ...actual, readKey: jest.fn(actual.readKey) };
});
const actualPgp = jest.requireActual<typeof import("openpgp")>("openpgp");
let mockClient: MailCryptoWorkerClient;
const mockLookup = jest.fn<() => Promise<{ publicKeyArmored: string }>>();
jest.mock("@/lib/mail/api-service", () => ({
  mailDemoApiService: { getRecipientKey: () => mockLookup() },
}));
jest.mock("@/lib/mail/worker-client", () => ({
  mailCryptoWorkerClient: {
    getVerificationContext: () => mockClient.getVerificationContext(),
    isVerificationContextCurrent: (
      ...args: Parameters<
        MailCryptoWorkerClient["isVerificationContextCurrent"]
      >
    ) => mockClient.isVerificationContextCurrent(...args),
    decryptMessage: (
      ...args: Parameters<MailCryptoWorkerClient["decryptMessage"]>
    ) => mockClient.decryptMessage(...args),
    encryptForRecipients: (
      ...args: Parameters<MailCryptoWorkerClient["encryptForRecipients"]>
    ) => mockClient.encryptForRecipients(...args),
  },
}));

import { decryptMessageForCompose } from "@/lib/mail/decrypt-message-for-compose";
import { createMailSealer } from "@/lib/mail/mail-app-helpers";

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
    if (!handler) throw new Error("Actual worker handler is unavailable");
    owners.set(request.requestId, this);
    handler({ data: request }).catch(() => {
      this.onmessageerror?.call(this, new MessageEvent("messageerror"));
    });
  }
}

const client = new StalwartJmapClient({
  baseUrl: "https://mail.example.test",
  accessToken: "SYNTHETIC",
  fetcher: async () => {
    throw new Error("No network is allowed in crypto fixture tests");
  },
});
const session: JmapSession = {
  accounts: {},
  primaryAccounts: {},
  apiUrl: "https://mail.example.test/jmap/",
};
const record = fixtures.records.find(
  (candidate) => candidate.name === "sender-structured",
);
if (!record) throw new Error("Sender corpus fixture missing");
const message: JmapEmailMessage = {
  id: record.message.id,
  from: [{ email: fixtures.keyFor("sender").email }],
  bodyStructure: record.message.bodyStructure,
};

async function load(name = "sender") {
  const key = fixtures.keyFor(name);
  const encrypted = await actualPgp.encryptKey({
    privateKey: await actualPgp.readPrivateKey({
      armoredKey: key.privateKeyArmored,
    }),
    passphrase: "SYNTHETIC",
  });
  return mockClient.loadVault({
    publicKeyArmored: key.publicKeyArmored,
    privateKeyArmored: encrypted.armor(),
    privateKeyPassphrase: "SYNTHETIC",
    ownAddresses: [key.email, "alias@custom.solace.test"],
  });
}

function decrypt(sender = fixtures.keyFor("sender").email) {
  return decryptMessageForCompose({
    client,
    session,
    message: { ...message, from: [{ email: sender }] },
    config: {
      defaultDomain: "mime-probe-6e3bc9.solace.test",
      discoveryBaseUrl: "https://mail.example.test",
      signupEnabled: true,
      oauth: { mailTokenEndpoint: "/synthetic" },
    },
  });
}

beforeAll(async () => {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: scope,
  });
  await import("@/workers/mail-crypto.worker");
});

beforeEach(async () => {
  owners.clear();
  jest.mocked(openpgp.readKey).mockImplementation(actualPgp.readKey);
  mockLookup
    .mockReset()
    .mockResolvedValue({
      publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
    });
  jest
    .spyOn(client, "getBlobAsText")
    .mockResolvedValue(fixtures.readCiphertext(record));
  mockClient = new MailCryptoWorkerClient(() => new InProcessWorker());
  await load();
});

afterAll(async () => {
  await mockClient.clear();
  if (originalSelf) Object.defineProperty(globalThis, "self", originalSelf);
  else Reflect.deleteProperty(globalThis, "self");
});

it.each(["primary", "alias"])(
  "verifies an own %s message using the local vault despite a substituted directory key",
  async (kind) => {
    const result = await decrypt(
      kind === "alias"
        ? " Alias@Custom.Solace.Test "
        : fixtures.keyFor("sender").email,
    );
    expect(result.signatureVerificationState).toBe("verified");
    expect(result.text).toBe(fixtures.expected.text);
    expect(mockLookup).not.toHaveBeenCalled();
  },
);

it("does not select the local self key for a foreign sender", async () => {
  const result = await decrypt(fixtures.keyFor("unrelated").email);
  expect(mockLookup).toHaveBeenCalledTimes(1);
  expect(result.signatureVerificationState).toBe("failed");
});

it("rejects a fake own signature even when the directory offers the attacker's key", async () => {
  const armoredMessage = await actualPgp.encrypt({
    message: await actualPgp.createMessage({ text: fixtures.expected.text }),
    encryptionKeys: await actualPgp.readKey({
      armoredKey: fixtures.keyFor("sender").publicKeyArmored,
    }),
    signingKeys: await actualPgp.readPrivateKey({
      armoredKey: fixtures.keyFor("unrelated").privateKeyArmored,
    }),
    format: "armored",
  });
  jest.mocked(client.getBlobAsText).mockResolvedValue(armoredMessage);
  const result = await decrypt();
  expect(result.signatureVerificationState).toBe("failed");
  expect(mockLookup).not.toHaveBeenCalled();
});

it("rejects a delayed directory result after an account switch even when the next key can decrypt", async () => {
  let entered: (() => void) | undefined;
  let resume: ((value: { publicKeyArmored: string }) => void) | undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  mockLookup.mockImplementationOnce(() => {
    entered?.();
    return new Promise((resolve) => {
      resume = resolve;
    });
  });
  const pending = decrypt("foreign@mime-probe-6e3bc9.solace.test");
  const rejected = expect(pending).rejects.toThrow("session changed");
  await started;
  await mockClient.clear();
  await load("ecc");
  resume?.({ publicKeyArmored: fixtures.keyFor("sender").publicKeyArmored });
  await rejected;
});

it("rejects an in-flight own decrypt across clear/reload of the same key", async () => {
  let entered: (() => void) | undefined;
  let resume: (() => void) | undefined;
  let paused = false;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  jest.mocked(openpgp.readKey).mockImplementation(async (input) => {
    if (
      !paused &&
      "armoredKey" in input &&
      input.armoredKey === fixtures.keyFor("sender").publicKeyArmored
    ) {
      paused = true;
      entered?.();
      await released;
    }
    return "armoredKey" in input
      ? actualPgp.readKey(input)
      : actualPgp.readKey(input);
  });
  const pending = decrypt();
  const rejected = expect(pending).rejects.toThrow("session changed");
  await started;
  await mockClient.clear();
  await load();
  resume?.();
  await rejected;
});

it("rejects an old production sealer after clear/reload before encryption or upload", async () => {
  const key = fixtures.keyFor("sender");
  const unlockedVault: UserKeyVault = {
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
  };
  const sealer = createMailSealer({ client, session, unlockedVault });
  const upload = jest.spyOn(client, "uploadTextBlob");
  await mockClient.clear();
  await load();
  await expect(
    sealer.encrypt({
      plaintext: "SYNTHETIC",
      recipientPublicKeysArmored: [key.publicKeyArmored],
    }),
  ).rejects.toThrow("session changed");
  await expect(sealer.upload("SYNTHETIC")).rejects.toThrow("session changed");
  expect(upload).not.toHaveBeenCalled();
});

it("refuses to establish local verification identity from mismatched public and private keys", async () => {
  const sender = fixtures.keyFor("sender");
  const privateKey = await actualPgp.encryptKey({
    privateKey: await actualPgp.readPrivateKey({
      armoredKey: sender.privateKeyArmored,
    }),
    passphrase: "SYNTHETIC",
  });
  await expect(
    mockClient.loadVault({
      privateKeyArmored: privateKey.armor(),
      privateKeyPassphrase: "SYNTHETIC",
      publicKeyArmored: fixtures.keyFor("unrelated").publicKeyArmored,
      ownAddresses: [sender.email],
    }),
  ).rejects.toThrow("public and private keys do not match");
  expect(mockClient.getVerificationContext()).toBeNull();
});

it("derives continuity fingerprints in the actual worker and refuses private directory keys", async () => {
  const key = fixtures.keyFor("sender");
  const inspected = await mockClient.inspectPublicKey({ armoredKey: key.publicKeyArmored, forEncryption: true });
  expect(inspected.fingerprint).toBe(key.fingerprint.toUpperCase());
  await expect(mockClient.inspectPublicKey({ armoredKey: key.privateKeyArmored, forEncryption: true })).rejects.toThrow("Invalid public mail key");
});

it("merges a new signed subkey under the same primary fingerprint and retains known subkeys", async () => {
  const source = fixtures.keyFor("sender");
  const privateKey = await actualPgp.readPrivateKey({ armoredKey: source.privateKeyArmored });
  const updated = await privateKey.addSubkey({ type: "ecc", curve: "curve25519Legacy", sign: false });
  const refreshed = await mockClient.inspectPublicKey({ armoredKey: updated.toPublic().armor(), knownArmoredKey: source.publicKeyArmored, forEncryption: true });
  expect(refreshed.fingerprint).toBe(source.fingerprint.toUpperCase());
  const merged = await actualPgp.readKey({ armoredKey: refreshed.publicKeyArmored });
  expect(merged.getSubkeys()).toHaveLength(privateKey.getSubkeys().length + 1);
  const retained = await mockClient.inspectPublicKey({ armoredKey: source.publicKeyArmored, knownArmoredKey: refreshed.publicKeyArmored, forEncryption: true });
  expect((await actualPgp.readKey({ armoredKey: retained.publicKeyArmored })).getSubkeys()).toHaveLength(merged.getSubkeys().length);
});

it("cannot erase a known revocation by refreshing the same primary from a stripped directory key", async () => {
  const key = fixtures.keyFor("sender");
  const revoked = await (await actualPgp.readPrivateKey({ armoredKey: key.privateKeyArmored })).revoke();
  await expect(mockClient.inspectPublicKey({ armoredKey: key.publicKeyArmored, knownArmoredKey: revoked.toPublic().armor(), forEncryption: true })).rejects.toThrow();
});

it("opens an HTML-only image draft without returning raw MIME as its editable text", async () => {
  const html = '<p>Screenshot</p><img src="data:image/png;base64,' + "A".repeat(1_400_000) + '">';
  const armoredMessage = await actualPgp.encrypt({
    message: await actualPgp.createMessage({ text: "Content-Type: text/html\r\n\r\n" + html }),
    encryptionKeys: await actualPgp.readKey({ armoredKey: fixtures.keyFor("sender").publicKeyArmored }),
    format: "armored",
  });
  jest.mocked(client.getBlobAsText).mockResolvedValue(armoredMessage);
  const result = await decrypt();
  expect(result.text).toBe("");
  expect(result.html).toBe(html);
  expect(result.rawMimeFallback).toBeUndefined();
});

it("reports a draft clipped at the read limit so it is refused before the editor is seeded", async () => {
  const armoredMessage = await actualPgp.encrypt({
    message: await actualPgp.createMessage({
      text:
        "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" +
        ("abc=20".repeat(12) + "=\r\n").repeat(30_000),
    }),
    encryptionKeys: await actualPgp.readKey({ armoredKey: fixtures.keyFor("sender").publicKeyArmored }),
    format: "armored",
  });
  jest.mocked(client.getBlobAsText).mockResolvedValue(armoredMessage);
  const result = await decrypt();
  expect(result.truncated).toBe(true);
  expect(result.text?.length).toBeLessThanOrEqual(MAX_MAIL_DISPLAY_CHARACTERS);
  expect(getMailDraftSizeError({ text: result.text, html: result.html })).toBeNull();
  expect(getMailDraftSizeError({ text: result.text, html: result.html, truncated: result.truncated })).toContain("saved draft has not been changed");
});

it("identifies a non-limit MIME parse fallback so draft editing can refuse it", async () => {
  const mime = await import("@workspace/calendar-core/mail-mime-parser");
  const parse = jest.spyOn(mime, "parseDecryptedMailContent").mockImplementationOnce(() => { throw new Error("MIME parse failed"); });
  try {
    const result = await decrypt();
    expect(result.rawMimeFallback).toBe(true);
    expect(result.html).toBeNull();
  } finally {
    parse.mockRestore();
  }
});
