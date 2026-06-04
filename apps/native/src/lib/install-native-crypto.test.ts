jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

const mockInstall = jest.fn(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: { subtle: {} },
    configurable: true,
  });
});

jest.mock("react-native-quick-crypto", () => ({
  install: () => mockInstall(),
}));

describe("install-native-crypto", () => {
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto",
  );

  afterEach(() => {
    jest.resetModules();
    mockInstall.mockClear();

    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor);
    } else {
      // @ts-expect-error test cleanup
      delete globalThis.crypto;
    }
  });

  it("installs react-native-quick-crypto on native startup", async () => {
    await import("./install-native-crypto");
    expect(mockInstall).toHaveBeenCalledTimes(1);
    expect(globalThis.crypto?.subtle).toBeDefined();
  });
});
