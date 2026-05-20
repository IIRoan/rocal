import { createE2eeModule } from "@workspace/e2ee";
import { createJsCryptoProvider } from "./js-crypto-provider";

jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
  getRandomValues: (buffer: Uint8Array) => {
    return globalThis.crypto.getRandomValues(buffer);
  },
}));

describe("createJsCryptoProvider", () => {
  it("supports the shared E2EE password envelope flow", async () => {
    const provider = createJsCryptoProvider();
    const e2ee = createE2eeModule(provider);
    const accountKey = await e2ee.generateAccountKey();
    const blindIndexKey = await e2ee.generateBlindIndexKey();

    const envelope = await e2ee.createPasswordEnvelope(
      accountKey,
      blindIndexKey,
      "hunter2",
      4,
    );
    const unwrapped = await e2ee.unwrapPasswordEnvelope("hunter2", envelope);
    const payload = await e2ee.encryptJsonPayload(
      unwrapped.accountKey,
      { title: "Secret" },
      "event-content:v1",
    );

    await expect(
      e2ee.decryptJsonPayload<{ title: string }>(
        unwrapped.accountKey,
        payload,
        "event-content:v1",
      ),
    ).resolves.toEqual({ title: "Secret" });

    await expect(
      e2ee.createBlindIndexTokens(unwrapped.blindIndexKey, "Secret project"),
    ).resolves.toHaveLength(2);
  });

  it("wraps and unwraps symmetric keys with exported RSA JWK keys", async () => {
    const provider = createJsCryptoProvider();
    const keyPair = (await provider.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 1024,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      false,
      ["wrapKey", "unwrapKey"],
    )) as unknown as CryptoKeyPair;
    const keyToWrap = await provider.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const iv = new Uint8Array(12);
    const plaintext = new TextEncoder().encode("hello");
    const wrapped = await provider.subtle.wrapKey(
      "raw",
      keyToWrap,
      keyPair.publicKey,
      { name: "RSA-OAEP" },
    );
    const exportedPrivateKey = await provider.subtle.exportKey(
      "jwk",
      keyPair.privateKey,
    );
    const importedPrivateKey = await provider.subtle.importKey(
      "jwk",
      exportedPrivateKey,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["unwrapKey"],
    );
    const unwrapped = await provider.subtle.unwrapKey(
      "raw",
      wrapped,
      importedPrivateKey,
      { name: "RSA-OAEP" },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const ciphertext = await provider.subtle.encrypt(
      { name: "AES-GCM", iv },
      unwrapped,
      plaintext,
    );

    await expect(
      provider.subtle.decrypt({ name: "AES-GCM", iv }, unwrapped, ciphertext),
    ).resolves.toEqual(plaintext.buffer);
  });
});
