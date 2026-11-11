import { afterAll, beforeAll, expect, it } from "@jest/globals";
import * as openpgp from "openpgp";
import { z } from "@workspace/calendar-core/zod";
import { parseDecryptedMailContent } from "@/lib/mail/decrypted-mail-content";
import { loadStalwart110MailFixtures } from "../../../../packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/fixture-loader";

const fixtures = loadStalwart110MailFixtures();
let response: unknown;
const scope: {
  onmessage:
    | ((event: {
        data: { requestId: number; type: string; payload?: unknown };
      }) => Promise<void>)
    | null;
  postMessage: (value: unknown) => void;
} = {
  onmessage: null,
  postMessage: (value) => {
    response = value;
  },
};
const originalSelf = Object.getOwnPropertyDescriptor(globalThis, "self");
const replySchema = z.object({
  error: z.string().optional(),
  payload: z.unknown().optional(),
});
const decryptedSchema = z.object({
  plaintext: z.string(),
  signatureVerificationState: z.enum([
    "verified",
    "not_signed",
    "unverified",
    "failed",
  ]),
  hasVerifiedSignature: z.boolean(),
  signatureVerificationLayers: z.array(
    z.enum(["verified", "not_signed", "unverified", "failed"]),
  ),
});
let requestId = 0;

async function workerCommand(type: string, payload?: unknown) {
  const handler = scope.onmessage;
  if (!handler) throw new Error("Worker did not register its actual handler");
  await handler({ data: { requestId: ++requestId, type, payload } });
  const result = replySchema.parse(response);
  if (result.error) throw new Error(result.error);
  return result.payload;
}

async function loadKey(name: string) {
  const key = fixtures.keyFor(name);
  const protectedKey = await openpgp.encryptKey({
    privateKey: await openpgp.readPrivateKey({
      armoredKey: key.privateKeyArmored,
    }),
    passphrase: "SYNTHETIC-FIXTURE-ONLY",
  });
  await workerCommand("CLEAR_ACTIVE_VAULT");
  await workerCommand("LOAD_ACTIVE_VAULT", {
    privateKeyArmored: protectedKey.armor(),
    privateKeyPassphrase: "SYNTHETIC-FIXTURE-ONLY",
    publicKeyArmored: key.publicKeyArmored,
  });
}

beforeAll(async () => {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: scope,
  });
  await import("@/workers/mail-crypto.worker");
});

afterAll(async () => {
  await workerCommand("CLEAR_ACTIVE_VAULT");
  if (originalSelf) Object.defineProperty(globalThis, "self", originalSelf);
  else Reflect.deleteProperty(globalThis, "self");
});

it.each(fixtures.records)(
  "opens actual target mail through the worker protocol: $name",
  async (record) => {
    await loadKey(record.owner);
    const armoredMessage = fixtures.readCiphertext(record);
    const result = decryptedSchema.parse(
      await workerCommand("DECRYPT_PGP_MESSAGE", {
        armoredMessage,
        senderPublicKeyArmored: fixtures.keyFor("sender").publicKeyArmored,
      }),
    );
    const parsed = await parseDecryptedMailContent(result.plaintext);
    expect(result.signatureVerificationState).toBe(record.expectedSignature);
    if (!record.usable) {
      expect(parsed.text).toBeNull();
      expect(parsed.html).toBeNull();
      expect(parsed.attachments).toHaveLength(2);
      return;
    }
    expect(parsed.text).toBe(fixtures.expected.text);
    expect(parsed.html).toBe(fixtures.expected.html);
    const attachment = parsed.attachments[0];
    if (!attachment || !(attachment.content instanceof ArrayBuffer))
      throw new Error("Synthetic attachment bytes missing");
    expect(attachment.filename).toBe("synthetic-notes.txt");
    expect(new TextDecoder().decode(attachment.content)).toBe(
      fixtures.expected.attachmentText,
    );
    expect(result.signatureVerificationLayers).toHaveLength(
      record.expectedLayers,
    );
    if (record.name === "ecc-structured") {
      expect(result.signatureVerificationLayers).toEqual([
        "not_signed",
        "verified",
      ]);
    }
  },
);

it("rejects unrelated keys and modified target ciphertext through the real worker", async () => {
  const record = fixtures.records.find(
    (candidate) => candidate.name === "ecc-inbound",
  );
  if (!record) throw new Error("Inbound fixture missing");
  await loadKey("unrelated");
  await expect(
    workerCommand("DECRYPT_PGP_MESSAGE", {
      armoredMessage: fixtures.readCiphertext(record),
    }),
  ).rejects.toThrow();
  await loadKey("ecc");
  const modified = fixtures
    .readCiphertext(record)
    .replace(
      /[A-Za-z0-9+/]{60}/,
      (line) => `${line[0] === "A" ? "B" : "A"}${line.slice(1)}`,
    );
  await expect(
    workerCommand("DECRYPT_PGP_MESSAGE", { armoredMessage: modified }),
  ).rejects.toThrow();
});

it("keeps the unsigned inner payload distinct from a verified outer layer", async () => {
  const record = fixtures.records.find(
    (candidate) => candidate.name === "ecc-inbound",
  );
  if (!record) throw new Error("Inbound fixture missing");
  const ciphertext = await openpgp.encrypt({
    message: await openpgp.createMessage({
      text: fixtures.readCiphertext(record),
    }),
    encryptionKeys: await openpgp.readKey({
      armoredKey: fixtures.keyFor("ecc").publicKeyArmored,
    }),
    signingKeys: await openpgp.readPrivateKey({
      armoredKey: fixtures.keyFor("sender").privateKeyArmored,
    }),
    format: "armored",
  });
  await loadKey("ecc");
  const result = decryptedSchema.parse(
    await workerCommand("DECRYPT_PGP_MESSAGE", {
      armoredMessage: ciphertext,
      senderPublicKeyArmored: fixtures.keyFor("sender").publicKeyArmored,
    }),
  );
  expect(result.signatureVerificationLayers).toEqual([
    "verified",
    "not_signed",
  ]);
});

it("rejects encrypted content past the four-layer budget", async () => {
  const record = fixtures.records.find(
    (candidate) => candidate.name === "ecc-inline",
  );
  if (!record) throw new Error("Inline fixture missing");
  let ciphertext = fixtures.readCiphertext(record);
  const encryptionKey = await openpgp.readKey({
    armoredKey: fixtures.keyFor("ecc").publicKeyArmored,
  });
  for (let layer = 0; layer < 4; layer += 1) {
    ciphertext = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: ciphertext }),
      encryptionKeys: encryptionKey,
      format: "armored",
    });
  }
  await loadKey("ecc");
  await expect(
    workerCommand("DECRYPT_PGP_MESSAGE", { armoredMessage: ciphertext }),
  ).rejects.toThrow("layer limit");
});
