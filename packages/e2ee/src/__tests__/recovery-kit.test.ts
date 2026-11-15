import { describe, expect, it } from "@jest/globals";
import { hkdfSync } from "node:crypto";

import { bytesToBase64Url } from "../e2ee-module";
import { hkdfSha256 } from "../hkdf";
import { formatRecoveryKey, parseRecoveryKey } from "../recovery-kit";
import { nodeCrypto, testE2eeModule as e2ee } from "./envelope-fixtures";

const SECRET = Uint8Array.from({ length: 16 }, (_, i) => i * 7);

async function sessionKeys() {
  return {
    accountKey: await e2ee.generateAccountKey(),
    blindIndexKey: await e2ee.generateBlindIndexKey(),
  };
}

describe("recovery kit", () => {
  it("formats eight groups of four and parses its own output", async () => {
    const key = await formatRecoveryKey(nodeCrypto, SECRET);

    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(await parseRecoveryKey(nodeCrypto, key)).toEqual(SECRET);
    expect(
      await parseRecoveryKey(nodeCrypto, ` ${key.toLowerCase().replace(/-/g, " ")} `),
    ).toEqual(SECRET);
  });

  it("reads I and L as 1 and O as 0", async () => {
    const key = await formatRecoveryKey(nodeCrypto, Uint8Array.from({ length: 16 }, () => 0x42));
    const ambiguous = key.replace(/1/g, "l").replace(/0/g, "O");

    expect(await parseRecoveryKey(nodeCrypto, ambiguous)).toEqual(
      await parseRecoveryKey(nodeCrypto, key),
    );
    expect(await parseRecoveryKey(nodeCrypto, key.replace(/1/g, "I"))).not.toBeNull();
  });

  it("refuses a one-character typo, a short key and a long key", async () => {
    const key = await formatRecoveryKey(nodeCrypto, SECRET);
    const first = key.charAt(0);
    const typo = `${first === "A" ? "B" : "A"}${key.slice(1)}`;

    expect(await parseRecoveryKey(nodeCrypto, typo)).toBeNull();
    expect(await parseRecoveryKey(nodeCrypto, key.slice(0, -1))).toBeNull();
    expect(await parseRecoveryKey(nodeCrypto, `${key}0`)).toBeNull();
    expect(await parseRecoveryKey(nodeCrypto, key.replace(/.$/, "U"))).toBeNull();
  });

  it("opens the envelope with the secret only", async () => {
    const keys = await sessionKeys();
    const { secret, recoveryKey } = await e2ee.generateRecoveryKey();
    const envelope = await e2ee.createRecoveryEnvelope(keys.accountKey, keys.blindIndexKey, secret);

    const parsed = await e2ee.parseRecoveryKey(recoveryKey);
    expect(parsed).toEqual(secret);
    const opened = await e2ee.unwrapRecoveryEnvelope(parsed ?? new Uint8Array(), envelope);
    const sealed = await e2ee.encryptJsonPayload(keys.accountKey, "kept");
    await expect(e2ee.decryptJsonPayload(opened.accountKey, sealed)).resolves.toBe("kept");
    await expect(
      e2ee.createBlindIndexTokens(opened.blindIndexKey, "dentist"),
    ).resolves.toEqual(await e2ee.createBlindIndexTokens(keys.blindIndexKey, "dentist"));

    const other = (await e2ee.generateRecoveryKey()).secret;
    await expect(e2ee.unwrapRecoveryEnvelope(other, envelope)).rejects.toThrow();
  });

  it("is not a password envelope, and a password envelope is not a recovery one", async () => {
    const keys = await sessionKeys();
    const envelope = await e2ee.createRecoveryEnvelope(keys.accountKey, keys.blindIndexKey, SECRET);
    const wrapRaw = await hkdfSha256(nodeCrypto, new Uint8Array(SECRET), "solace/recovery-wrap/v1");
    const wrapKey = await nodeCrypto.subtle.importKey("raw", wrapRaw, { name: "AES-GCM" }, false, [
      "decrypt",
    ]);
    const wrapped: { iv: string; ciphertext: string } = JSON.parse(envelope.wrappedAccountKey);
    const decode = (value: string) => Buffer.from(value, "base64url");

    await expect(
      nodeCrypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(wrapped.iv), additionalData: Buffer.from("account-key:1") },
        wrapKey,
        decode(wrapped.ciphertext),
      ),
    ).rejects.toThrow();
  });

  it("derives an rk1 auth key that is not the wrapping key", async () => {
    const authKey = await e2ee.deriveRecoveryAuthKey(SECRET);
    const wrapRaw = await hkdfSha256(nodeCrypto, new Uint8Array(SECRET), "solace/recovery-wrap/v1");

    expect(authKey).toMatch(/^rk1:[A-Za-z0-9_-]{43}$/);
    expect(authKey).not.toContain(bytesToBase64Url(wrapRaw));
    expect(await e2ee.deriveRecoveryAuthKey(SECRET)).toBe(authKey);
    await expect(e2ee.deriveRecoveryAuthKey(new Uint8Array(8))).rejects.toThrow();
  });

  it("matches RFC 5869 HKDF-SHA-256 with a zero salt", async () => {
    const ikm = Uint8Array.from({ length: 22 }, () => 0x0b);
    const expected = new Uint8Array(
      hkdfSync("sha256", ikm, new Uint8Array(32), "solace/recovery-auth/v1", 32),
    );

    expect(await hkdfSha256(nodeCrypto, ikm, "solace/recovery-auth/v1")).toEqual(expected);
    expect(bytesToBase64Url(await hkdfSha256(nodeCrypto, ikm, "x"))).toBe(
      "4N0qph78YSXSm5qIrkDXCRvZhTcK2oQpiJHqlXWF_pE",
    );
  });
});
