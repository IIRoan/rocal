import { describe, expect, it, jest } from "@jest/globals";
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { bytesToBase64Url, createE2eeModule, type Argon2idDerive } from "../e2ee-module";
import { nodeCrypto, stubArgon2id } from "./envelope-fixtures";

const nobleArgon2id: Argon2idDerive = (password, salt, params) =>
  argon2idAsync(password, salt, {
    m: params.memoryKiB,
    t: params.passes,
    p: params.parallelism,
    dkLen: 32,
  });

async function argon2idEnvelope(argon2id: Argon2idDerive = stubArgon2id) {
  const e2ee = createE2eeModule(nodeCrypto, { argon2id });
  const accountKey = await e2ee.generateAccountKey();
  const envelope = await e2ee.createPasswordEnvelope(
    accountKey,
    await e2ee.generateBlindIndexKey(),
    "pw",
  );
  return { accountKey, envelope };
}

describe("Argon2id password envelopes", () => {
  it("round-trips with the real Argon2id and the write parameters", async () => {
    const e2ee = createE2eeModule(nodeCrypto, { argon2id: nobleArgon2id });
    const { accountKey, envelope } = await argon2idEnvelope(nobleArgon2id);

    const recovered = await e2ee.unwrapPasswordEnvelope("pw", envelope);

    const sealed = await e2ee.encryptJsonPayload(accountKey, "kept");
    await expect(e2ee.decryptJsonPayload(recovered.accountKey, sealed)).resolves.toBe("kept");
  }, 120_000);

  it.each([
    ["too little memory", { kdfMemoryKiB: 8192 }],
    ["too much memory", { kdfMemoryKiB: 262144 }],
    ["missing memory", { kdfMemoryKiB: null }],
    ["one pass", { kdfIterations: 1 }],
    ["eleven passes", { kdfIterations: 11 }],
    ["eight lanes", { kdfParallelism: 8 }],
    ["an 8-byte salt", { kdfSalt: bytesToBase64Url(new Uint8Array(8)) }],
    ["a 32-byte salt", { kdfSalt: bytesToBase64Url(new Uint8Array(32)) }],
    ["an unknown KDF", { kdfAlgorithm: "scrypt" }],
  ])("refuses %s before deriving anything", async (_case, override) => {
    const { envelope } = await argon2idEnvelope();
    const argon2id = jest.fn(stubArgon2id);
    const e2ee = createE2eeModule(nodeCrypto, { argon2id });

    await expect(e2ee.unwrapPasswordEnvelope("pw", { ...envelope, ...override })).rejects.toThrow(
      /Password envelope has (an )?(invalid|unsupported)/,
    );
    expect(argon2id).not.toHaveBeenCalled();
  });

  it("cannot open or write an Argon2id envelope without a provider", async () => {
    const { envelope } = await argon2idEnvelope();
    const e2ee = createE2eeModule(nodeCrypto);

    await expect(e2ee.unwrapPasswordEnvelope("pw", envelope)).rejects.toThrow("Argon2id");
    await expect(
      e2ee.createPasswordEnvelope(await e2ee.generateAccountKey(), await e2ee.generateBlindIndexKey(), "pw"),
    ).rejects.toThrow("Argon2id");
  });

  it("passes the envelope's parameters and the NFKC password to the provider", async () => {
    const { envelope } = await argon2idEnvelope();
    const argon2id = jest.fn(stubArgon2id);
    const e2ee = createE2eeModule(nodeCrypto, { argon2id });

    await e2ee.unwrapPasswordEnvelope("pw", envelope);

    expect(argon2id).toHaveBeenCalledWith(
      new TextEncoder().encode("pw"),
      new Uint8Array(Buffer.from(envelope.kdfSalt, "base64url")),
      { memoryKiB: 65536, passes: 3, parallelism: 4 },
    );
  });
});
