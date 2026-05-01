const warn = jest.fn();
const info = jest.fn();

type NativeCryptoModule = typeof import("./native-crypto-provider");

const originalCrypto = globalThis.crypto;

function loadModule({
  executionEnvironment,
  appOwnership,
  subtle,
}: {
  executionEnvironment: string;
  appOwnership?: string;
  subtle?: SubtleCrypto;
}): NativeCryptoModule {
  jest.resetModules();
  warn.mockReset();
  info.mockReset();

  if (subtle) {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { subtle },
    });
  } else {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
  }

  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: {
      executionEnvironment,
      appOwnership,
    },
  }));
  jest.doMock("expo-crypto", () => ({
    randomUUID: jest.fn(() => "uuid"),
    getRandomValues: jest.fn((buffer: Uint8Array) => buffer),
  }));
  jest.doMock("@workspace/logger", () => ({
    createLogger: () => ({
      warn,
      info,
      error: jest.fn(),
    }),
  }));

  return require("./native-crypto-provider") as NativeCryptoModule;
}

afterAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: originalCrypto,
  });
});

describe("native crypto provider", () => {
  it("skips native crypto setup in Expo-managed guest runtimes", async () => {
    const { createNativeCryptoProvider, installCryptoPolyfill } = loadModule({
      executionEnvironment: "standalone",
      appOwnership: "guest",
    });

    await expect(installCryptoPolyfill()).resolves.toBeUndefined();
    expect(createNativeCryptoProvider()).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Expo-managed runtime detected"),
    );
  });

  it("returns a provider when standalone runtime has subtle crypto", () => {
    const subtle = {
      generateKey: jest.fn(),
      importKey: jest.fn(),
      exportKey: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      wrapKey: jest.fn(),
      unwrapKey: jest.fn(),
      sign: jest.fn(),
      deriveKey: jest.fn(),
    } as unknown as SubtleCrypto;

    const { createNativeCryptoProvider } = loadModule({
      executionEnvironment: "standalone",
      appOwnership: "standalone",
      subtle,
    });

    expect(createNativeCryptoProvider()).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
