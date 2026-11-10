import { mock } from "bun:test";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import * as openpgp from "openpgp";
import { createE2eeModule } from "@workspace/e2ee";

globalThis.Worker = undefined;
mock.module("@workspace/logger", () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}));
mock.module("expo-crypto", () => ({
  getRandomValues: (bytes) => crypto.getRandomValues(bytes),
}));
mock.module("@workspace/native-core/lib/load-quick-crypto", () => ({
  loadQuickCrypto: () => null,
}));

const web = await import("../../../../../apps/web/lib/mail/vault-crypto.ts");
const native =
  await import("../../../../../apps/native-mail/src/lib/mail/native-vault-crypto.ts");
const singleLane = {
  saltB64: "AAECAwQFBgcICQoLDA0ODw==",
  memoryKiB: 512,
  iterations: 1,
  parallelism: 1,
};
const fourLanes = { ...singleLane, memoryKiB: 1024, parallelism: 4 };
const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const inputs = [
  {
    id: "web-base64url-p1",
    producer: "web",
    passphrase: secret,
    kdfParams: singleLane,
  },
  {
    id: "native-base64url-p4",
    producer: "native-noble",
    passphrase: secret,
    kdfParams: fourLanes,
  },
  {
    id: "web-unicode-p4",
    producer: "web",
    passphrase: "synthetic-é-🔑-日本語",
    kdfParams: fourLanes,
  },
  {
    id: "native-unicode-p1",
    producer: "native-noble",
    passphrase: "synthetic-é-🔑-日本語",
    kdfParams: singleLane,
  },
];
const reference = JSON.parse(
  execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `
  import { argon2Sync } from "node:crypto";
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const vectors = JSON.parse(input).map(({ passphrase, kdfParams }) => ({
    expectedKeyHex: argon2Sync("argon2id", {
      message: Buffer.from(passphrase, "utf8"), nonce: Buffer.from(kdfParams.saltB64, "base64"),
      parallelism: kdfParams.parallelism, tagLength: 32, memory: kdfParams.memoryKiB, passes: kdfParams.iterations,
    }).toString("hex"),
  }));
  process.stdout.write(JSON.stringify({ node: process.version, openssl: process.versions.openssl, vectors }));
`,
    ],
    { input: JSON.stringify(inputs), encoding: "utf8" },
  ),
);
const accountKeyB64 = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index),
).toString("base64");
const accountKey = await crypto.subtle.importKey(
  "raw",
  Buffer.from(accountKeyB64, "base64"),
  { name: "AES-GCM" },
  false,
  ["encrypt", "decrypt"],
);
const e2ee = createE2eeModule(crypto);
const fixtures = [];

for (const [index, input] of inputs.entries()) {
  const generated = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [
      { name: "Synthetic fixture only", email: "vault-fixture@solace.test" },
    ],
    passphrase: input.passphrase,
    format: "armored",
    date: new Date("2026-11-10T00:00:00Z"),
  });
  const publicKey = await openpgp.readKey({ armoredKey: generated.publicKey });
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({
      armoredKey: generated.privateKey,
    }),
    passphrase: input.passphrase,
  });
  const expectedVault = {
    userId: "synthetic-vault-fixture",
    email: "vault-fixture@solace.test",
    publicKeyArmored: generated.publicKey,
    publicKeyFingerprint: publicKey.getFingerprint(),
    encryptedPrivateKeyArmored: generated.privateKey,
    kdf: "argon2id",
    kdfParams: input.kdfParams,
    vaultVersion: 1,
    createdAt: "2026-11-10T00:00:00.000Z",
  };
  const producer = input.producer === "web" ? web : native;
  const output = await producer.createEncryptedMailVault(
    expectedVault,
    input.passphrase,
    input.kdfParams,
  );
  const consumer = input.producer === "web" ? native : web;
  const opened = await consumer.unlockEncryptedMailVault(
    output.encryptedVaultB64,
    input.passphrase,
    input.kdfParams,
  );
  if (JSON.stringify(opened) !== JSON.stringify(expectedVault))
    throw new Error("Foreign vault reader disagrees");
  const plaintext = `Synthetic fixture ${input.id}: private mail stays on-device.`;
  const armoredMessage = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: plaintext }),
    encryptionKeys: publicKey,
    signingKeys: privateKey,
    format: "armored",
  });
  const wrappedSecret = JSON.stringify(
    await e2ee.encryptJsonPayload(
      accountKey,
      { secret: input.passphrase },
      "mail-vault-secret",
    ),
  );
  fixtures.push({
    ...input,
    ...reference.vectors[index],
    encryptedVaultB64: output.encryptedVaultB64,
    expectedVault,
    wrappedSecret,
    armoredMessage,
    plaintext,
  });
}

await writeFile(
  new URL("./mail-vault-v1.json", import.meta.url),
  JSON.stringify(
    {
      notice:
        "SYNTHETIC TEST MATERIAL ONLY. Never use these keys, passwords or accounts outside tests.",
      formatVersion: 1,
      baseline: "475ff6dbd80710f8b4f419c49bc0d4582fe02f73",
      producerRuntime: `Bun ${Bun.version}`,
      referenceKdf: {
        implementation: "node:crypto.argon2Sync",
        node: reference.node,
        openssl: reference.openssl,
      },
      accountKeyB64,
      fixtures,
    },
    null,
    2,
  ) + "\n",
);
