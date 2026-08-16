import { createE2eeModule } from "@workspace/e2ee";
import { createNativeCryptoProvider } from "./native-crypto-provider";

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
  getRandomValues: (buffer: Uint8Array) =>
    globalThis.crypto.getRandomValues(buffer as Uint8Array<ArrayBuffer>),
}));

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "crypto",
);

const realGetRandomValues = (globalThis.crypto.getRandomValues.bind(
  globalThis.crypto,
)) as <T extends ArrayBufferView | null>(array: T) => T;

function setGlobalCrypto(value: Record<string, unknown>) {
  Object.defineProperty(globalThis, "crypto", {
    value: { getRandomValues: realGetRandomValues, ...value },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalCryptoDescriptor) {
    Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor);
  }
});

describe("createNativeCryptoProvider", () => {
  it("falls back to the pure-JS provider when no native subtle is available", () => {
    setGlobalCrypto({});
    const provider = createNativeCryptoProvider();
    expect(typeof provider.subtle.generateKey).toBe("function");
    expect(typeof provider.randomUUID()).toBe("string");
    expect(provider.getRandomValues(new Uint8Array(8))).toHaveLength(8);
  });

  it("runs a full E2EE password-envelope roundtrip on the JS fallback", async () => {
    setGlobalCrypto({});
    const e2ee = createE2eeModule(createNativeCryptoProvider());

    const accountKey = await e2ee.generateAccountKey();
    const blindIndexKey = await e2ee.generateBlindIndexKey();
    const envelope = await e2ee.createPasswordEnvelope(
      accountKey,
      blindIndexKey,
      "correct horse",
      4,
    );

    const unwrapped = await e2ee.unwrapPasswordEnvelope(
      "correct horse",
      envelope,
    );
    const payload = await e2ee.encryptJsonPayload(
      unwrapped.accountKey,
      { title: "Top secret" },
      "event-content:v1",
    );

    await expect(
      e2ee.decryptJsonPayload<{ title: string }>(
        unwrapped.accountKey,
        payload,
        "event-content:v1",
      ),
    ).resolves.toEqual({ title: "Top secret" });

    await expect(
      e2ee.unwrapPasswordEnvelope("wrong password", envelope),
    ).rejects.toBeDefined();
  });

  it("prefers a native crypto.subtle implementation when one is present", async () => {
    const subtle = {
      generateKey: jest.fn().mockResolvedValue("native-key"),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      importKey: jest.fn(),
      exportKey: jest.fn(),
      wrapKey: jest.fn(),
      unwrapKey: jest.fn(),
      sign: jest.fn(),
      deriveKey: jest.fn(),
    };
    setGlobalCrypto({ subtle });

    const provider = createNativeCryptoProvider();
    await expect(
      provider.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ]),
    ).resolves.toBe("native-key");
    expect(subtle.generateKey).toHaveBeenCalledTimes(1);
  });
});
