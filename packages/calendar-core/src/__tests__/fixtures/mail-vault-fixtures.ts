import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "../../zod";

const kdfSchema = z.strictObject({
  saltB64: z.string(),
  memoryKiB: z.number().int().positive(),
  iterations: z.number().int().positive(),
  parallelism: z.number().int().positive(),
});

const envelopeSchema = z.strictObject({
  version: z.literal(1),
  algorithm: z.literal("AES-GCM-256"),
  ivB64: z.string(),
  ciphertextB64: z.string(),
});

const fixtureSchema = z.strictObject({
  id: z.string(),
  producer: z.enum(["web", "native-noble"]),
  passphrase: z.string(),
  kdfParams: kdfSchema,
  expectedKeyHex: z.string().regex(/^[0-9a-f]{64}$/),
  encryptedVaultB64: z.string(),
  expectedVault: z.strictObject({
    userId: z.string(),
    email: z.string(),
    publicKeyArmored: z.string(),
    publicKeyFingerprint: z.string(),
    encryptedPrivateKeyArmored: z.string(),
    kdf: z.literal("argon2id"),
    kdfParams: kdfSchema,
    vaultVersion: z.number(),
    createdAt: z.string(),
  }),
  wrappedSecret: z.string(),
  armoredMessage: z.string(),
  plaintext: z.string(),
});

const corpusSchema = z.strictObject({
  notice: z.string(),
  formatVersion: z.literal(1),
  baseline: z.string(),
  producerRuntime: z.string(),
  referenceKdf: z.strictObject({
    implementation: z.string(),
    node: z.string(),
    openssl: z.string(),
  }),
  accountKeyB64: z.string(),
  fixtures: z.array(fixtureSchema).min(4),
});

export const mailVaultFixtures = corpusSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "mail-vault-v1.json"), "utf8")),
);

export function readFixtureEnvelope(encryptedVaultB64: string) {
  return envelopeSchema.parse(
    JSON.parse(Buffer.from(encryptedVaultB64, "base64").toString("utf8")),
  );
}

export function corruptFixtureCiphertext(
  encryptedVaultB64: string,
  truncate = false,
): string {
  const envelope = readFixtureEnvelope(encryptedVaultB64);
  const ciphertext = Buffer.from(envelope.ciphertextB64, "base64");
  const changed = truncate
    ? ciphertext.subarray(0, 8)
    : Buffer.from(ciphertext);
  const lastByte = changed[changed.length - 1];
  if (!truncate) {
    if (lastByte === undefined) throw new Error("Fixture ciphertext is empty");
    changed[changed.length - 1] = lastByte ^ 1;
  }
  return Buffer.from(
    JSON.stringify({ ...envelope, ciphertextB64: changed.toString("base64") }),
  ).toString("base64");
}

export function invalidFixtureEnvelopes(
  encryptedVaultB64: string,
): Array<{ name: string; value: string }> {
  const envelope = readFixtureEnvelope(encryptedVaultB64);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64");
  return [
    {
      name: "changed authentication tag",
      value: corruptFixtureCiphertext(encryptedVaultB64),
    },
    {
      name: "truncated ciphertext",
      value: corruptFixtureCiphertext(encryptedVaultB64, true),
    },
    { name: "unsupported version", value: encode({ ...envelope, version: 2 }) },
    {
      name: "unsupported algorithm",
      value: encode({ ...envelope, algorithm: "unsupported" }),
    },
    {
      name: "malformed JSON",
      value: Buffer.from("{invalid").toString("base64"),
    },
  ];
}
