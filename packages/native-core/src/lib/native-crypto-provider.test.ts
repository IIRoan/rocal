import { loadQuickCrypto } from "./load-quick-crypto";
import { createNativeCryptoProvider, nativeArgon2id } from "./native-crypto-provider";

jest.mock("./load-quick-crypto", () => ({ loadQuickCrypto: jest.fn() }));

const mockLoadQuickCrypto = jest.mocked(loadQuickCrypto);

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

describe("nativeArgon2id", () => {
  const params = { memoryKiB: 65536, passes: 3, parallelism: 4 };

  it("derives 32 bytes with quick-crypto's argon2Sync and the envelope's parameters", async () => {
    const argon2Sync = jest.fn(() => new Uint8Array(32).fill(7));
    mockLoadQuickCrypto.mockReturnValue({ argon2Sync });
    const password = new Uint8Array([1]);
    const salt = new Uint8Array(16);

    await expect(nativeArgon2id(password, salt, params)).resolves.toEqual(new Uint8Array(32).fill(7));
    expect(argon2Sync).toHaveBeenCalledWith("argon2id", {
      message: password,
      nonce: salt,
      memory: 65536,
      passes: 3,
      parallelism: 4,
      tagLength: 32,
    });
  });

  it("throws without argon2Sync instead of falling back to JavaScript", async () => {
    mockLoadQuickCrypto.mockReturnValue({});

    await expect(nativeArgon2id(new Uint8Array([1]), new Uint8Array(16), params)).rejects.toThrow("Argon2id");
  });
});
