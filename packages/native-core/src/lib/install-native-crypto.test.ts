jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

const mockPlatform = { OS: "ios" as string };

jest.mock("react-native", () => ({
  Platform: mockPlatform,
}));

const mockInstall = jest.fn();
const mockQuickCrypto = {
  install: () => mockInstall(),
  subtle: undefined as { encrypt?: () => void } | undefined,
};

jest.mock("react-native-quick-crypto", () => mockQuickCrypto);

function openpgpGetWebCrypto(cryptoRef = globalThis.crypto) {
  const webCrypto = cryptoRef?.subtle;
  if (!webCrypto) {
    throw new Error("The WebCrypto API is not available");
  }
  return webCrypto;
}

describe("install-native-crypto", () => {
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto",
  );

  beforeEach(() => {
    mockInstall.mockReset();
    mockQuickCrypto.subtle = undefined;
    mockPlatform.OS = "ios";
  });

  afterEach(() => {
    jest.resetModules();

    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor);
    } else {
      // @ts-expect-error test cleanup
      delete globalThis.crypto;
    }
  });

  it("installs react-native-quick-crypto on native startup", async () => {
    mockInstall.mockImplementation(() => {
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        configurable: true,
        writable: true,
      });
    });

    const mod = await import("./install-native-crypto");
    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(mod.hasUsableWebCrypto()).toBe(true);
    expect(mod.isNativeCryptoReady()).toBe(true);
    expect(() => openpgpGetWebCrypto()).not.toThrow();
  });

  it("is idempotent across repeated installNativeCrypto calls", async () => {
    mockInstall.mockImplementation(() => {
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        configurable: true,
        writable: true,
      });
    });

    const mod = await import("./install-native-crypto");
    expect(mod.installNativeCrypto()).toBe(true);
    expect(mod.installNativeCrypto()).toBe(true);
    expect(mockInstall).toHaveBeenCalledTimes(1);
  });

  it("skips the native installer on web", async () => {
    mockPlatform.OS = "web";
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
      writable: true,
    });

    const mod = await import("./install-native-crypto");
    expect(mockInstall).not.toHaveBeenCalled();
    expect(mod.isNativeCryptoReady()).toBe(false);
  });

  it("assigns QuickCrypto.subtle when install() leaves global crypto empty", async () => {
    const subtle = { encrypt: jest.fn() };
    mockQuickCrypto.subtle = subtle;
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
      writable: true,
    });

    const mod = await import("./install-native-crypto");
    expect(mod.hasUsableWebCrypto()).toBe(true);
    expect(globalThis.crypto.subtle).toBe(subtle);
  });
});

describe("hasUsableWebCrypto", () => {
  it("matches OpenPGP.js 6's module-eval check", async () => {
    mockInstall.mockImplementation(() => {
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        configurable: true,
        writable: true,
      });
    });
    const { hasUsableWebCrypto } = await import("./install-native-crypto");
    expect(hasUsableWebCrypto({ subtle: {} })).toBe(true);
    expect(hasUsableWebCrypto({})).toBe(false);
    expect(hasUsableWebCrypto(null)).toBe(false);
  });
});
