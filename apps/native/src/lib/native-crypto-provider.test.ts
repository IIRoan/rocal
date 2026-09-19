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
  it("throws when no native subtle is available", () => {
    setGlobalCrypto({});
    expect(() => createNativeCryptoProvider()).toThrow(/crypto\.subtle is unavailable/);
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
