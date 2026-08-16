import { webcrypto } from "crypto";
import { TextDecoder, TextEncoder } from "util";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { scheme: "solace", extra: { appVariant: "production" } },
    executionEnvironment: "standalone",
  },
}));

jest.mock("expo-updates", () => ({
  isEnabled: false,
  channel: null,
  updateId: null,
  createdAt: null,
  runtimeVersion: null,
  isEmbeddedLaunch: true,
  useUpdates: () => ({
    isRestarting: false,
    isDownloading: false,
    isUpdatePending: false,
    isUpdateAvailable: false,
    downloadError: null,
    downloadProgress: undefined,
  }),
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
  getRandomValues: (buffer: Uint8Array) =>
    globalThis.crypto.getRandomValues(buffer as Uint8Array<ArrayBuffer>),
}));

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) =>
    fn(...args),
}));

jest.mock("react-native-quick-crypto", () => ({
  install: jest.fn(),
}));

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    writable: true,
  });
}

if (typeof globalThis.TextEncoder === "undefined") {
  Object.defineProperty(globalThis, "TextEncoder", {
    value: TextEncoder,
    writable: true,
  });
}

if (typeof globalThis.TextDecoder === "undefined") {
  Object.defineProperty(globalThis, "TextDecoder", {
    value: TextDecoder,
    writable: true,
  });
}
