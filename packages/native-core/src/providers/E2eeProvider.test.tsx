/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
  E2eeBootstrapResponse,
  E2eePasswordRecord,
} from "@workspace/calendar-core";
import * as SecureStore from "expo-secure-store";
import { createE2eeModule } from "@workspace/e2ee";
import { createNativeCryptoProvider } from "../lib/native-crypto-provider";
import { useAuth } from "./AuthProvider";
import { E2eeProvider, useE2ee } from "./E2eeProvider";
import { getActiveE2eeSession } from "../lib/e2ee-session";
import { clearRecoverableStoredDevice } from "../lib/native-e2ee-provider";

jest.mock("react-native", () => ({
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    hairlineWidth: 1,
  },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockDeleteE2eeDevice = jest.fn(async (_deviceId: string) => undefined);
jest.mock("../lib/api", () => ({
  getAuthHeaders: jest.fn(() => ({})),
  calendarApiService: {
    deleteE2eeDevice: (deviceId: string) => mockDeleteE2eeDevice(deviceId),
  },
}));

jest.mock("../lib/native-crypto-provider", () => ({
  createNativeCryptoProvider: jest.fn(),
}));

jest.mock("./AuthProvider", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@workspace/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock("@workspace/e2ee", () => {
  const actual =
    jest.requireActual<typeof import("@workspace/e2ee")>("@workspace/e2ee");
  return {
    ENCRYPTED_EVENT_PLACEHOLDER_TITLE: "Encrypted event",
    createE2eeModule: jest.fn(),
    hydrateEncryptedEventWithoutSession: jest.fn((event) => event),
    encryptEventContentRequest: actual.encryptEventContentRequest,
    encryptNameRequest: actual.encryptNameRequest,
    hydrateEncryptedName: actual.hydrateEncryptedName,
    openEncryptedEvent: actual.openEncryptedEvent,
    lockWithoutDeviceKeys: actual.lockWithoutDeviceKeys,
    resolveDeviceEnvelopeSalt: actual.resolveDeviceEnvelopeSalt,
    shouldUpgradePasswordEnvelope: actual.shouldUpgradePasswordEnvelope,
    withoutPlaintextEventContent: actual.withoutPlaintextEventContent,
    withoutPlaintextName: actual.withoutPlaintextName,
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type E2eeContextValue = ReturnType<typeof useE2ee>;

const mockGetItemAsync = jest.mocked(SecureStore.getItemAsync);
const mockSetItemAsync = jest.mocked(SecureStore.setItemAsync);
const mockDeleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);
const mockCreateE2eeModule = jest.mocked(createE2eeModule);
const mockCreateNativeCryptoProvider = jest.mocked(createNativeCryptoProvider);
const mockUseAuth = jest.mocked(useAuth);

const accountKey = { type: "account-key" } as unknown as CryptoKey;
const blindIndexKey = { type: "blind-index-key" } as unknown as CryptoKey;
const mockCryptoProvider = {
  subtle: {
    exportKey: jest.fn(),
    importKey: jest.fn(),
  },
};

const mockE2eeModule = {
  generateWrappingKeyPair: jest.fn(),
  exportWrappingPublicKey: jest.fn(),
  wrapSymmetricKey: jest.fn(),
  generateDeviceId: jest.fn(),
  unwrapAccountKey: jest.fn(),
  unwrapBlindIndexKey: jest.fn(),
  unwrapPasswordEnvelope: jest.fn(),
  generateAccountKey: jest.fn(),
  generateBlindIndexKey: jest.fn(),
  createPasswordEnvelope: jest.fn(),
  encryptJsonPayload: jest.fn(),
  decryptJsonPayload: jest.fn(),
  createBlindIndexTokens: jest.fn(),
};

function createBootstrapResponse(
  overrides?: Partial<E2eeBootstrapResponse>,
): E2eeBootstrapResponse {
  return {
    algorithms: {
      content: "AES-GCM-256",
      blindIndex: "HMAC-SHA-256",
      wrapping: "RSA-OAEP-4096",
      passwordWrapping: "PBKDF2-SHA-256",
    },
    devices: [],
    passwordEnvelope: null,
    calendars: [],
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function createMockAuthContext(
  overrides?: Partial<ReturnType<typeof useAuth>>,
): ReturnType<typeof useAuth> {
  return {
    user: null,
    session: null,
    isLoading: false,
    isAuthenticated: false,
    requiresPasskeyStepUp: false,
    lastAuthMethod: "unknown",
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    signInNotice: null,
    signInWithPasskey: jest.fn(),
    completePasskeyStepUp: jest.fn(),
    registerPasskey: jest.fn(),
    deletePasskey: jest.fn(),
    consumePendingAuthPassword: jest.fn(() => null),
    peekPendingAuthPassword: jest.fn(() => null),
    clearPendingAuthPassword: jest.fn(),
    refreshUser: jest.fn(async () => undefined),
    ...overrides,
  };
}

function storeDevice(
  envelopeSalt: string | null,
  extra: Record<string, string | null> = {},
) {
  const stored: Record<string, string | null> = {
    E2EE_DEVICE_ID: "device-1",
    E2EE_PRIVATE_KEY: '{"kty":"RSA"}',
    E2EE_DEVICE_KEYS: JSON.stringify({
      deviceId: "device-1",
      wrappedAccountKey: "own-account-key",
      wrappedSearchKey: "own-search-key",
    }),
    E2EE_ENVELOPE_SALT: envelopeSalt,
    ...extra,
  };
  mockGetItemAsync.mockImplementation(
    async (key: string) => stored[key] ?? null,
  );
}

const storedDeviceRecord = {
  id: "device-row",
  userId: "user-1",
  deviceId: "device-1",
  deviceLabel: null,
  publicKey: "public-key",
  publicKeyAlgorithm: "RSA-OAEP-4096",
  wrappedAccountKey: "wrapped-account-key",
  wrappedSearchKey: "wrapped-search-key",
  wrapAlgorithm: "RSA-OAEP-4096",
  keyVersion: 1,
  lastSeenAt: new Date(0),
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const argon2idKdf = {
  kdfAlgorithm: "Argon2id",
  kdfIterations: 3,
  kdfMemoryKiB: 65536,
  kdfParallelism: 4,
};

function createPasswordRecord(
  overrides?: Partial<E2eePasswordRecord>,
): E2eePasswordRecord {
  return {
    id: "password-record-1",
    userId: "user-1",
    kdfAlgorithm: "PBKDF2-SHA-256",
    kdfSalt: "salt",
    kdfIterations: 600000,
    kdfMemoryKiB: null,
    kdfParallelism: null,
    wrappedAccountKey: "wrapped-account",
    wrappedSearchKey: "wrapped-search",
    wrapAlgorithm: "AES-GCM-256",
    keyVersion: 1,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("E2eeProvider", () => {
  let capturedE2ee: E2eeContextValue | null = null;
  let container: HTMLDivElement;
  let root: Root;
  let mockFetch: jest.Mock;
  let peekPendingAuthPassword: jest.Mock;
  let consumePendingAuthPassword: jest.Mock;
  let clearPendingAuthPassword: jest.Mock;

  function E2eeProbe() {
    capturedE2ee = useE2ee();
    const statusLabel = capturedE2ee
      ? [
          capturedE2ee.isReady ? "ready" : "not-ready",
          ":",
          capturedE2ee.isEnabled ? "enabled" : "disabled",
        ].join("")
      : "";
    return <div data-testid="e2ee-status">{statusLabel}</div>;
  }

  async function renderProvider() {
    await act(async () => {
      root.render(
        <E2eeProvider>
          <E2eeProbe />
        </E2eeProvider>,
      );
      // React 18+ concurrent mode defers scheduler work via MessageChannel /
      // setTimeout. Advance fake timers inside act so those callbacks fire
      // before act exits, preventing "update not wrapped in act" warnings.
      jest.runAllTimers();
      await Promise.resolve();
    });
    if (!capturedE2ee) {
      throw new Error(
        "renderProvider: E2eeProbe did not render — E2eeProvider may have thrown during initial render.",
      );
    }
  }

  // Flush async bootstrap state updates: advance fake timers then drain the
  // microtask queue. Wrapping in act ensures React commits the updates.
  async function flushBootstrap() {
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });
  }

  function getE2ee() {
    if (!capturedE2ee) {
      throw new Error("E2EE context was not captured.");
    }

    return capturedE2ee;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    capturedE2ee = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockFetch = jest.fn();
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetch as typeof fetch;

    peekPendingAuthPassword = jest.fn().mockReturnValue(null);
    consumePendingAuthPassword = jest.fn().mockReturnValue(null);
    clearPendingAuthPassword = jest.fn();

    mockGetItemAsync.mockReset();
    mockDeleteE2eeDevice.mockClear();
    mockSetItemAsync.mockReset();
    mockDeleteItemAsync.mockReset();
    mockCreateE2eeModule.mockReset();
    mockCreateNativeCryptoProvider.mockReset();
    mockUseAuth.mockReset();

    mockCryptoProvider.subtle.exportKey.mockReset();
    mockCryptoProvider.subtle.importKey.mockReset();
    mockE2eeModule.generateWrappingKeyPair.mockReset();
    mockE2eeModule.exportWrappingPublicKey.mockReset();
    mockE2eeModule.wrapSymmetricKey.mockReset();
    mockE2eeModule.generateDeviceId.mockReset();
    mockE2eeModule.unwrapAccountKey.mockReset();
    mockE2eeModule.unwrapBlindIndexKey.mockReset();
    mockE2eeModule.unwrapPasswordEnvelope.mockReset();
    mockE2eeModule.generateAccountKey.mockReset();
    mockE2eeModule.generateBlindIndexKey.mockReset();
    mockE2eeModule.createPasswordEnvelope.mockReset();
    mockE2eeModule.encryptJsonPayload.mockReset();
    mockE2eeModule.decryptJsonPayload.mockReset();
    mockE2eeModule.createBlindIndexTokens.mockReset();

    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "unknown",
      }),
    );

    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue();
    mockDeleteItemAsync.mockResolvedValue();
    mockCreateE2eeModule.mockReturnValue(mockE2eeModule as never);
    mockCreateNativeCryptoProvider.mockReturnValue(mockCryptoProvider as never);

    mockCryptoProvider.subtle.exportKey.mockResolvedValue({
      kty: "RSA",
      kid: "device-private-key",
    });
    mockE2eeModule.generateWrappingKeyPair.mockResolvedValue({
      publicKey: { kid: "public" },
      privateKey: { kid: "private" },
    });
    mockE2eeModule.exportWrappingPublicKey.mockResolvedValue("public-key");
    mockE2eeModule.wrapSymmetricKey
      .mockResolvedValueOnce("wrapped-account-key")
      .mockResolvedValueOnce("wrapped-search-key");
    mockE2eeModule.generateDeviceId.mockReturnValue("device-1");
    mockE2eeModule.unwrapPasswordEnvelope.mockResolvedValue({
      accountKey,
      blindIndexKey,
    });
    mockE2eeModule.generateAccountKey.mockResolvedValue(accountKey);
    mockE2eeModule.generateBlindIndexKey.mockResolvedValue(blindIndexKey);
    mockE2eeModule.createPasswordEnvelope.mockResolvedValue({
      ...argon2idKdf,
      kdfSalt: "salt",
      wrappedAccountKey: "wrapped-account",
      wrappedSearchKey: "wrapped-search",
      wrapAlgorithm: "AES-GCM-256",
      keyVersion: 1,
    });
  });

  afterEach(() => {
    // Flush any timers that may have been scheduled during the test before
    // unmounting, to avoid "not wrapped in act" warnings from leaked updates.
    act(() => {
      jest.runAllTimers();
    });
    act(() => {
      root.unmount();
    });
    jest.useRealTimers();
    container.remove();
  });

  it.each(["offline", 503, "malformed"])(
    "keeps encryption unready after %s and restores the same device keys when the API recovers",
    async (failure) => {
      storeDevice("salt");
      mockE2eeModule.unwrapAccountKey.mockResolvedValue(accountKey);
      mockE2eeModule.unwrapBlindIndexKey.mockResolvedValue(blindIndexKey);
      if (failure === "offline") {
        mockFetch.mockRejectedValueOnce(new Error("offline"));
      } else {
        mockFetch.mockResolvedValueOnce(
          jsonResponse({}, failure === 503 ? 503 : 200),
        );
      }
      await renderProvider();
      await act(async () => {
        await expect(
          getE2ee().bootstrap("user-1", "https://api.solace.test"),
        ).rejects.toThrow();
      });

      expect(getE2ee().isReady).toBe(false);
      expect(getActiveE2eeSession()).toBeNull();
      expect(clearPendingAuthPassword).not.toHaveBeenCalled();
      mockFetch.mockResolvedValue(
        jsonResponse(
          createBootstrapResponse({
            devices: [storedDeviceRecord],
            passwordEnvelope: createPasswordRecord(),
          }),
        ),
      );
      await act(async () => {
        await getE2ee().bootstrap("user-1", "https://api.solace.test");
      });

      expect(getE2ee().isReady).toBe(true);
      expect(getActiveE2eeSession()?.accountKey).toBe(accountKey);
      expect(mockE2eeModule.generateAccountKey).not.toHaveBeenCalled();
    },
  );

  it("aborts a bootstrap request that never answers so startup can retry", async () => {
    mockFetch.mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(new Error("Request timed out")),
          );
        }),
    );
    await renderProvider();
    await act(async () => {
      const attempt = expect(
        getE2ee().bootstrap("user-1", "https://api.solace.test"),
      ).rejects.toThrow("Request timed out");
      await Promise.resolve();
      jest.advanceTimersByTime(10_000);
      await attempt;
    });
    expect(getE2ee().isReady).toBe(false);
    expect(getActiveE2eeSession()).toBeNull();
  });

  it.each(["device", "password"])("aborts a stalled %s write and can unlock on the next attempt", async (endpoint) => {
    peekPendingAuthPassword.mockReturnValue("secret-password");
    const bootstrap = createBootstrapResponse({
      passwordEnvelope: endpoint === "device" ? createPasswordRecord() : null,
    });
    mockE2eeModule.wrapSymmetricKey.mockReset().mockImplementation(async (key: CryptoKey) =>
      key === accountKey ? "wrapped-account-key" : "wrapped-search-key",
    );
    let signal: AbortSignal | null | undefined;
    mockFetch.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.endsWith(`/${endpoint}`)) {
        signal = options.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("Request timed out")));
        });
      }
      return jsonResponse(bootstrap);
    });
    await renderProvider();
    let outcome = "pending";
    await act(async () => {
      getE2ee().bootstrap("user-1", "https://api.solace.test")
        .then(() => { outcome = "resolved"; })
        .catch(() => { outcome = "rejected"; });
    });
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith(`/${endpoint}`))).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(9_999); });
    expect(outcome).toBe("pending");
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(outcome).toBe("rejected");
    expect(signal?.aborted).toBe(true);
    expect(getE2ee().isReady).toBe(false);
    expect(getActiveE2eeSession()).toBeNull();
    expect(clearPendingAuthPassword).not.toHaveBeenCalled();

    mockFetch.mockImplementation(async (url: string) => jsonResponse(
      url.endsWith("/bootstrap") ? bootstrap : {},
    ));
    await act(async () => {
      await expect(getE2ee().bootstrap("user-1", "https://api.solace.test")).resolves.toBeNull();
    });
    expect(getE2ee().isReady).toBe(true);
    expect(getActiveE2eeSession()?.accountKey).toBe(accountKey);
  });

  it.each(["device 503", "lost envelope response"])("retains the password after %s without replacing the stored account keys", async (failure) => {
    let pendingPassword: string | null = "secret-password";
    let envelopeStored = false;
    let registrations = 0;
    peekPendingAuthPassword.mockImplementation(() => pendingPassword);
    clearPendingAuthPassword.mockImplementation(() => { pendingPassword = null; });
    mockE2eeModule.wrapSymmetricKey.mockReset().mockImplementation(async (key: CryptoKey) =>
      key === accountKey ? "wrapped-account-key" : "wrapped-search-key",
    );
    mockFetch.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.endsWith("/bootstrap")) {
        return jsonResponse(createBootstrapResponse({
          passwordEnvelope: envelopeStored ? createPasswordRecord(argon2idKdf) : null,
        }));
      }
      if (url.endsWith("/password")) {
        envelopeStored = true;
        if (failure === "lost envelope response") {
          return new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => reject(new Error("Request timed out")));
          });
        }
        return jsonResponse({});
      }
      if (url.endsWith("/device")) {
        registrations += 1;
        return jsonResponse({}, failure === "device 503" && registrations === 1 ? 503 : 200);
      }
      throw new Error("Unexpected fixture request");
    });
    await renderProvider();
    await act(async () => {
      const attempt = expect(getE2ee().bootstrap("user-1", "https://api.solace.test")).rejects.toThrow(
        failure === "device 503" ? "503" : "Request timed out",
      );
      if (failure === "lost envelope response") await jest.advanceTimersByTimeAsync(10_000);
      await attempt;
    });
    expect(clearPendingAuthPassword).not.toHaveBeenCalled();
    expect(getE2ee().isReady).toBe(false);

    await act(async () => {
      await expect(getE2ee().bootstrap("user-1", "https://api.solace.test")).resolves.toBeNull();
    });
    expect(mockE2eeModule.unwrapPasswordEnvelope).toHaveBeenCalledWith("secret-password", expect.anything());
    expect(mockE2eeModule.generateAccountKey).toHaveBeenCalledTimes(1);
    expect(mockE2eeModule.createPasswordEnvelope).toHaveBeenCalledTimes(1);
    expect(getE2ee().isReady).toBe(true);
    expect(clearPendingAuthPassword).toHaveBeenCalledTimes(1);
    expect(pendingPassword).toBeNull();
  });

  it.each([401, 403])(
    "ends a rejected bootstrap session (%s) without exposing a ready runtime",
    async (status) => {
      mockFetch.mockResolvedValue(jsonResponse({}, status));
      await renderProvider();
      await act(async () => {
        await expect(
          getE2ee().bootstrap("user-1", "https://api.solace.test"),
        ).resolves.toBe("sign-in-again");
      });

      expect(getE2ee().isReady).toBe(false);
      expect(getActiveE2eeSession()).toBeNull();
      expect(mockE2eeModule.generateAccountKey).not.toHaveBeenCalled();
    },
  );

  it("does not expose a ready runtime when native crypto is unavailable", async () => {
    mockCreateNativeCryptoProvider.mockImplementation(() => {
      throw new Error("Native crypto unavailable");
    });
    await renderProvider();
    await act(async () => {
      await expect(
        getE2ee().bootstrap("user-1", "https://api.solace.test"),
      ).rejects.toThrow();
    });
    expect(getE2ee().isReady).toBe(false);
    expect(getActiveE2eeSession()).toBeNull();
  });

  it("auto-unlocks a password envelope with the pending email sign-in password", async () => {
    peekPendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "email-password",
      }),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({
            passwordEnvelope: createPasswordRecord(),
          }),
        );
      }

      if (url.endsWith("/api/e2ee/device")) {
        return jsonResponse({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(mockE2eeModule.unwrapPasswordEnvelope).toHaveBeenCalledWith(
      "secret-password",
      expect.objectContaining({
        wrappedAccountKey: "wrapped-account",
      }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/device",
      expect.objectContaining({
        method: "PUT",
      }),
    );
    expect(mockSetItemAsync).toHaveBeenLastCalledWith(
      "E2EE_ENVELOPE_SALT",
      "salt",
    );
    expect(getE2ee().isReady).toBe(true);
    expect(getE2ee().isEnabled).toBe(true);
  });

  it("reports a password mismatch without minting keys when the sign-in password does not open the envelope", async () => {
    peekPendingAuthPassword.mockReturnValue("new-sign-in-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "email-password",
      }),
    );
    mockE2eeModule.unwrapPasswordEnvelope.mockRejectedValue(
      new Error("decryption failed"),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({
            passwordEnvelope: createPasswordRecord(),
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    let lock: unknown;
    await act(async () => {
      lock = await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(lock).toBe("cannot-open");
    expect(getE2ee().isReady).toBe(false);
    expect(mockE2eeModule.generateAccountKey).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/device",
      expect.anything(),
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/password",
      expect.anything(),
    );
  });

  it("registers no device and keeps the password for a retry when the first envelope cannot be stored", async () => {
    peekPendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "email-password",
      }),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(createBootstrapResponse());
      }

      if (url.endsWith("/api/e2ee/device")) {
        return jsonResponse({});
      }

      if (url.endsWith("/api/e2ee/password")) {
        return jsonResponse({}, 500);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    await act(async () => {
      await expect(
        getE2ee().bootstrap("user-1", "https://api.solace.test"),
      ).rejects.toThrow();
    });
    await flushBootstrap();

    expect(getE2ee().isReady).toBe(false);
    expect(clearPendingAuthPassword).not.toHaveBeenCalled();
    expect(
      mockFetch.mock.calls.some(([url]) =>
        String(url).endsWith("/api/e2ee/device"),
      ),
    ).toBe(false);
  });

  it("auto-saves a password envelope for first-device email sign-in", async () => {
    peekPendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "email-password",
      }),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(createBootstrapResponse());
      }

      if (
        url.endsWith("/api/e2ee/device") ||
        url.endsWith("/api/e2ee/password")
      ) {
        return jsonResponse({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(mockE2eeModule.generateAccountKey).toHaveBeenCalled();
    expect(mockE2eeModule.createPasswordEnvelope).toHaveBeenCalledWith(
      accountKey,
      blindIndexKey,
      "secret-password",
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/password",
      expect.objectContaining({
        method: "PUT",
      }),
    );
    const writes = mockFetch.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.endsWith("/password") || url.endsWith("/device"));
    expect(writes).toEqual([
      "https://api.solace.test/api/e2ee/password",
      "https://api.solace.test/api/e2ee/device",
    ]);
    expect(clearPendingAuthPassword).toHaveBeenCalled();
  });

  it("publishes a freshly minted session so sign-up can seal the mail vault", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(createBootstrapResponse());
      }

      if (url.endsWith("/api/e2ee/device")) {
        return jsonResponse({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(getActiveE2eeSession()).toMatchObject({
      userId: "user-1",
      deviceId: "device-1",
      accountKey,
    });
    expect(mockSetItemAsync).not.toHaveBeenCalledWith(
      "E2EE_ENVELOPE_SALT",
      expect.anything(),
    );
  });

  it.each([
    ["the envelope holds the device's account key", true, "salt"],
    ["the device minted a second account key", false, undefined],
  ])(
    "verifies a restored device key with the sign-in password when %s",
    async (_case, sameKey, marker) => {
      storeDevice(null);
      peekPendingAuthPassword.mockReturnValue("secret-password");
      mockCryptoProvider.subtle.importKey.mockResolvedValue({ kid: "private" });
      mockE2eeModule.unwrapAccountKey.mockResolvedValue(accountKey);
      mockE2eeModule.unwrapBlindIndexKey.mockResolvedValue(blindIndexKey);
      mockE2eeModule.unwrapPasswordEnvelope.mockResolvedValue({
        accountKey: { type: "envelope-account-key" },
        blindIndexKey,
      });
      mockE2eeModule.encryptJsonPayload.mockResolvedValue({
        ciphertext: "probe",
      });
      mockE2eeModule.decryptJsonPayload.mockImplementation(async () => {
        if (!sameKey) throw new Error("OperationError");
        return true;
      });
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith("/api/e2ee/bootstrap")) {
          return jsonResponse(
            createBootstrapResponse({
              devices: [storedDeviceRecord],
              passwordEnvelope: createPasswordRecord(),
            }),
          );
        }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();
    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

      expect(getActiveE2eeSession()).toMatchObject({
        deviceId: "device-1",
        accountKey,
      });
      expect(
        mockSetItemAsync.mock.calls.find(
          ([key]) => key === "E2EE_ENVELOPE_SALT",
        )?.[1],
      ).toBe(marker);
    },
  );

  describe("rewrapping an older envelope with the sign-in password", () => {
    function mockApi(passwordEnvelope: E2eePasswordRecord, devices: E2eeBootstrapResponse["devices"]) {
      mockE2eeModule.createPasswordEnvelope.mockResolvedValue({
        kdfAlgorithm: "Argon2id",
        kdfSalt: "new-salt",
        kdfIterations: 3,
        kdfMemoryKiB: 65536,
        kdfParallelism: 4,
        wrappedAccountKey: "rewrapped-account",
        wrappedSearchKey: "rewrapped-search",
        wrapAlgorithm: "AES-GCM-256",
        keyVersion: 1,
      });
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith("/api/e2ee/bootstrap")) {
          return jsonResponse(createBootstrapResponse({ devices, passwordEnvelope }));
        }
        if (url.endsWith("/api/e2ee/device") || url.endsWith("/api/e2ee/password")) {
          return jsonResponse({});
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
    }

    function storeUnlockableDevice(envelopeSalt: string | null) {
      storeDevice(envelopeSalt);
      mockCryptoProvider.subtle.importKey.mockResolvedValue({ kid: "private" });
      mockE2eeModule.unwrapAccountKey.mockResolvedValue(accountKey);
      mockE2eeModule.unwrapBlindIndexKey.mockResolvedValue(blindIndexKey);
    }

    async function bootstrapAndReadPasswordWrites() {
      await renderProvider();
      await act(async () => {
        await getE2ee().bootstrap("user-1", "https://api.solace.test");
      });
      await flushBootstrap();
      return mockFetch.mock.calls
        .filter(([url]) => String(url).endsWith("/api/e2ee/password"))
        .map(([, init]: [string, { body: string }]) => JSON.parse(init.body));
    }

    it.each([
      ["after unlocking from it", null],
      ["on a device whose key it is known to hold", "salt"],
    ])("rewraps a PBKDF2 envelope to Argon2id %s", async (_case, deviceSalt) => {
      peekPendingAuthPassword.mockReturnValue("secret-password");
      if (deviceSalt) storeUnlockableDevice(deviceSalt);
      mockApi(createPasswordRecord(), deviceSalt ? [storedDeviceRecord] : []);

      const writes = await bootstrapAndReadPasswordWrites();

      expect(mockE2eeModule.createPasswordEnvelope).toHaveBeenCalledWith(
        accountKey,
        blindIndexKey,
        "secret-password",
      );
      expect(writes).toEqual([
        expect.objectContaining({ kdfAlgorithm: "Argon2id", kdfMemoryKiB: 65536, kdfParallelism: 4 }),
      ]);
      expect(mockSetItemAsync).toHaveBeenLastCalledWith("E2EE_ENVELOPE_SALT", "new-salt");
    });

    it("does not rewrap when the device key is not the envelope's", async () => {
      peekPendingAuthPassword.mockReturnValue("secret-password");
      storeUnlockableDevice(null);
      mockE2eeModule.unwrapPasswordEnvelope.mockResolvedValue({
        accountKey: { type: "envelope-account-key" },
        blindIndexKey,
      });
      mockE2eeModule.encryptJsonPayload.mockResolvedValue({ ciphertext: "probe" });
      mockE2eeModule.decryptJsonPayload.mockRejectedValue(new Error("OperationError"));
      mockApi(createPasswordRecord({ kdfIterations: 310000 }), [storedDeviceRecord]);

      await expect(bootstrapAndReadPasswordWrites()).resolves.toEqual([]);
      expect(getActiveE2eeSession()).toMatchObject({ deviceId: "device-1", accountKey });
    });

    it("leaves an Argon2id envelope", async () => {
      peekPendingAuthPassword.mockReturnValue("secret-password");
      storeUnlockableDevice("salt");
      mockApi(
        createPasswordRecord(argon2idKdf),
        [storedDeviceRecord],
      );

      await expect(bootstrapAndReadPasswordWrites()).resolves.toEqual([]);
    });

    it("does not rewrap without a sign-in password", async () => {
      storeUnlockableDevice("salt");
      mockApi(createPasswordRecord({ kdfIterations: 310000 }), [storedDeviceRecord]);

      await expect(bootstrapAndReadPasswordWrites()).resolves.toEqual([]);
      expect(mockE2eeModule.createPasswordEnvelope).not.toHaveBeenCalled();
    });

    it.each([
      ["the envelope check", null],
      ["the rewrap", "salt"],
    ])("stores nothing when another account signs in during %s", async (_step, deviceSalt) => {
      const otherAccountKey = { type: "other-account-key" } as unknown as CryptoKey;
      peekPendingAuthPassword.mockReturnValueOnce("secret-password").mockReturnValue(null);
      storeUnlockableDevice(deviceSalt);
      mockE2eeModule.unwrapAccountKey
        .mockResolvedValueOnce(accountKey)
        .mockResolvedValueOnce(otherAccountKey);
      mockApi(createPasswordRecord({ kdfIterations: 310000 }), [storedDeviceRecord]);
      const held = deviceSalt
        ? mockE2eeModule.createPasswordEnvelope
        : mockE2eeModule.unwrapPasswordEnvelope;
      const value = deviceSalt
        ? { kdfSalt: "new-salt", kdfIterations: 600000 }
        : { accountKey, blindIndexKey };
      let release: () => void = () => undefined;
      held.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(value); }));
      mockE2eeModule.encryptJsonPayload.mockResolvedValue({ ciphertext: "probe" });
      mockE2eeModule.decryptJsonPayload.mockResolvedValue(true);
      await renderProvider();

      let first: Promise<unknown> = Promise.resolve();
      await act(async () => {
        first = getE2ee().bootstrap("user-1", "https://api.solace.test");
      });
      expect(held).toHaveBeenCalledTimes(1);
      await act(async () => {
        await getE2ee().bootstrap("user-2", "https://api.solace.test");
      });
      await act(async () => {
        release();
        await first;
      });

      expect(mockFetch.mock.calls.filter(([url]) => String(url).endsWith("/api/e2ee/password"))).toEqual([]);
      expect(mockE2eeModule.createPasswordEnvelope).not.toHaveBeenCalledWith(
        otherAccountKey,
        expect.anything(),
        expect.anything(),
      );
      expect(getActiveE2eeSession()).toMatchObject({ userId: "user-2", accountKey: otherAccountKey });
    });
  });

  it("forgets the envelope check of a restored device key once the envelope changed", async () => {
    storeDevice("previous-salt");
    mockCryptoProvider.subtle.importKey.mockResolvedValue({ kid: "private" });
    mockE2eeModule.unwrapAccountKey.mockResolvedValue(accountKey);
    mockE2eeModule.unwrapBlindIndexKey.mockResolvedValue(blindIndexKey);
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({
            devices: [storedDeviceRecord],
            passwordEnvelope: createPasswordRecord(),
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();
    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(mockDeleteItemAsync).toHaveBeenCalledWith("E2EE_ENVELOPE_SALT");
  });

  it("drops the server row of a stored key that no longer opens and lets the envelope decide", async () => {
    storeDevice("salt");
    mockCryptoProvider.subtle.importKey.mockResolvedValue({ kid: "private" });
    mockE2eeModule.unwrapAccountKey.mockRejectedValue(
      new Error("OperationError"),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({
            devices: [storedDeviceRecord],
            passwordEnvelope: createPasswordRecord(),
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();
    let lock: unknown;
    await act(async () => {
      lock = await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });

    expect(lock).toBe("sign-in-again");
    expect(mockDeleteE2eeDevice).toHaveBeenCalledWith("device-1");
  });

  it("keeps the server row of a stored key that no longer opens when the envelope is not known to hold it", async () => {
    storeDevice("older-salt");
    mockCryptoProvider.subtle.importKey.mockResolvedValue({ kid: "private" });
    mockE2eeModule.unwrapAccountKey.mockRejectedValue(new Error("OperationError"));
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({ devices: [storedDeviceRecord], passwordEnvelope: createPasswordRecord() }),
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();
    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });

    expect(mockDeleteE2eeDevice).not.toHaveBeenCalled();
  });

  it("keeps the device and its server row when its stored keys cannot be read", async () => {
    storeDevice("salt");
    const stored = mockGetItemAsync.getMockImplementation();
    mockGetItemAsync.mockImplementation(async (key: string) => {
      if (key === "E2EE_DEVICE_KEYS") throw new Error("Keychain unavailable");
      return (await stored?.(key)) ?? null;
    });
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({ devices: [storedDeviceRecord], passwordEnvelope: createPasswordRecord() }),
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();
    await act(async () => {
      await expect(getE2ee().bootstrap("user-1", "https://api.solace.test")).rejects.toThrow("Keychain unavailable");
    });

    expect(mockDeleteE2eeDevice).not.toHaveBeenCalled();
    expect(mockSetItemAsync).not.toHaveBeenCalledWith("E2EE_DEVICE_ID", expect.anything());
  });

  it.each([
    ["deletes the device key the envelope is known to hold", "salt", true],
    ["keeps a device key no envelope is known to hold", null, false],
  ])("%s on sign-out", async (_case, marker, deleted) => {
    storeDevice(marker);

    await clearRecoverableStoredDevice();

    expect(mockDeleteItemAsync.mock.calls.map(([key]) => key)).toEqual(
      deleted
        ? [
            "E2EE_EVENT_CONTENT_BOUND",
            "E2EE_DEVICE_ID",
            "E2EE_PRIVATE_KEY",
            "E2EE_DEVICE_KEYS",
            "E2EE_ENVELOPE_SALT",
          ]
        : ["E2EE_EVENT_CONTENT_BOUND"],
    );
  });

  it("unwraps its own copy of the keys, never the server's", async () => {
    storeDevice("salt");
    mockCryptoProvider.subtle.importKey.mockResolvedValue({ kid: "private" });
    mockE2eeModule.unwrapAccountKey.mockResolvedValue(accountKey);
    mockE2eeModule.unwrapBlindIndexKey.mockResolvedValue(blindIndexKey);
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({
            devices: [storedDeviceRecord],
            passwordEnvelope: createPasswordRecord(),
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();
    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(getActiveE2eeSession()).toMatchObject({ deviceId: "device-1", accountKey });
    expect(mockE2eeModule.unwrapAccountKey).toHaveBeenCalledWith("own-account-key", expect.anything());
    expect(mockE2eeModule.unwrapAccountKey).not.toHaveBeenCalledWith("wrapped-account-key", expect.anything());
  });

  describe("a device without its own copy of its wrapped keys", () => {
    const blankServerCopy = { ...storedDeviceRecord, wrappedAccountKey: "", wrappedSearchKey: "" };

    function mockApi(passwordEnvelope: E2eePasswordRecord | null) {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.endsWith("/api/e2ee/bootstrap")) {
          return jsonResponse(createBootstrapResponse({ devices: [blankServerCopy], passwordEnvelope }));
        }
        if (url.endsWith("/api/e2ee/device")) return jsonResponse({});
        throw new Error(`Unexpected fetch: ${url}`);
      });
    }

    async function bootstrap() {
      await renderProvider();
      let lock: unknown;
      await act(async () => {
        lock = await getE2ee().bootstrap("user-1", "https://api.solace.test");
      });
      await flushBootstrap();
      return lock;
    }

    it.each([
      ["has none at all", { E2EE_DEVICE_KEYS: null }],
      [
        "has only an earlier device's",
        {
          E2EE_DEVICE_KEYS: JSON.stringify({
            deviceId: "device-0",
            wrappedAccountKey: "old-account-key",
            wrappedSearchKey: "old-search-key",
          }),
        },
      ],
    ])("opens the envelope with the sign-in password when it %s", async (_case, extra) => {
      storeDevice("salt", extra);
      peekPendingAuthPassword.mockReturnValue("secret-password");
      mockE2eeModule.generateDeviceId.mockReturnValue("device-2");
      mockApi(createPasswordRecord());

      await expect(bootstrap()).resolves.toBeNull();

      expect(mockE2eeModule.unwrapAccountKey).not.toHaveBeenCalled();
      expect(mockE2eeModule.unwrapPasswordEnvelope).toHaveBeenCalledWith("secret-password", expect.anything());
      expect(mockDeleteE2eeDevice).toHaveBeenCalledWith("device-1");
      expect(getActiveE2eeSession()).toMatchObject({ deviceId: "device-2", accountKey });
      const registration = mockFetch.mock.calls.find(([url]) => String(url).endsWith("/api/e2ee/device"));
      expect(JSON.parse(registration?.[1].body)).toEqual({ deviceId: "device-2", publicKey: "public-key" });
      const writes = mockSetItemAsync.mock.calls.map(([key]) => key);
      expect(writes.indexOf("E2EE_DEVICE_KEYS")).toBeLessThan(writes.indexOf("E2EE_DEVICE_ID"));
      expect(JSON.parse(mockSetItemAsync.mock.calls.find(([key]) => key === "E2EE_DEVICE_KEYS")?.[1] ?? "null")).toEqual({
        deviceId: "device-2",
        wrappedAccountKey: "wrapped-account-key",
        wrappedSearchKey: "wrapped-search-key",
      });
    });

    it("asks for a sign-in without the password", async () => {
      storeDevice("salt", { E2EE_DEVICE_KEYS: null });
      mockApi(createPasswordRecord());

      await expect(bootstrap()).resolves.toBe("sign-in-again");
      expect(mockE2eeModule.unwrapAccountKey).not.toHaveBeenCalled();
    });

    it("keeps its server row when no envelope can stand in for it", async () => {
      storeDevice(null, { E2EE_DEVICE_KEYS: null });
      mockApi(null);

      await expect(bootstrap()).resolves.toBe("cannot-open");
      expect(mockDeleteE2eeDevice).not.toHaveBeenCalled();
    });
  });

  it("wraps the active keys to a new password without storing the envelope itself", async () => {
    peekPendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "email-password",
      }),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(createBootstrapResponse());
      }

      if (
        url.endsWith("/api/e2ee/device") ||
        url.endsWith("/api/e2ee/password")
      ) {
        return jsonResponse({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    mockE2eeModule.createPasswordEnvelope.mockClear();
    mockFetch.mockClear();

    await expect(
      getE2ee().createPasswordEnvelope("fresh-password"),
    ).resolves.toEqual(expect.objectContaining({ kdfSalt: "salt" }));

    expect(mockE2eeModule.createPasswordEnvelope).toHaveBeenCalledWith(
      accountKey,
      blindIndexKey,
      "fresh-password",
    );
    // The change-password request carries it, so the server stores both or neither.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses to wrap keys without an unlocked session", async () => {
    await renderProvider();

    await expect(
      getE2ee().createPasswordEnvelope("fresh-password"),
    ).rejects.toThrow("not unlocked");
    expect(mockE2eeModule.createPasswordEnvelope).not.toHaveBeenCalled();
  });

  it("starts a fresh E2EE session for passkey sign-in on a new device", async () => {
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "passkey",
      }),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(createBootstrapResponse());
      }

      if (url.endsWith("/api/e2ee/device")) {
        return jsonResponse({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(getE2ee().isReady).toBe(true);
    expect(getE2ee().isEnabled).toBe(true);
    expect(mockE2eeModule.generateAccountKey).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/device",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("builds ciphertext-only event and name payloads once a session exists", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(createBootstrapResponse());
      }

      if (url.endsWith("/api/e2ee/device")) {
        return jsonResponse({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    mockE2eeModule.encryptJsonPayload.mockResolvedValue({
      version: 1,
      algorithm: "AES-GCM",
      iv: "iv",
      ciphertext: "ciphertext",
    });
    mockE2eeModule.decryptJsonPayload.mockResolvedValue({ name: "Therapy" });

    await renderProvider();
    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    const { provider } = getE2ee();
    const event = await provider.attachEventEncryptionShadow({
      title: "Therapy",
      description: "Notes",
      location: "Clinic",
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T10:00:00.000Z",
      calendarId: "calendar-1",
    }, "event-1");
    const calendar = await provider.attachCalendarEncryptionShadow({
      name: "Therapy",
      color: "blue",
    });

    expect(event).not.toHaveProperty("title");
    expect(event).not.toHaveProperty("description");
    expect(event).not.toHaveProperty("location");
    expect(event.encryptedContent).toBeDefined();
    expect(calendar).not.toHaveProperty("name");
    expect(calendar.encryptedName).toBeDefined();
    expect(JSON.stringify([event, calendar])).not.toMatch(
      /Therapy|Notes|Clinic|blindIndexTokens/,
    );
    expect(mockE2eeModule.createBlindIndexTokens).not.toHaveBeenCalled();
    await expect(provider.hasActiveSession()).resolves.toBe(true);
    await expect(
      provider.hydrateEncryptedCalendar({
        id: "calendar-1",
        name: "",
        encryptedName: calendar.encryptedName,
        color: "blue",
        kind: "owned",
        isPublic: false,
        isVisible: true,
        isDefault: false,
        isSyncOnly: false,
        userId: "user-1",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      }),
    ).resolves.toMatchObject({ name: "Therapy" });

    const legacy = {
      id: "event-1",
      title: "",
      encryptedContent: event.encryptedContent,
      encryptionState: "encrypted" as const,
      encryptionKeyVersion: 1,
      start: new Date(0),
      end: new Date(0),
      calendarId: "calendar-1",
      userId: "user-1",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    expect(mockE2eeModule.encryptJsonPayload).toHaveBeenCalledWith(
      accountKey,
      expect.anything(),
      "event-content:v2:event-1",
    );
    mockE2eeModule.decryptJsonPayload.mockResolvedValue({ title: "Therapy" });
    await expect(provider.hydrateEncryptedEvent(legacy)).resolves.toMatchObject({
      title: "Therapy",
    });
    await expect(provider.refusesUnboundContent()).resolves.toBe(false);
    await provider.markEventContentBound();
    expect(mockSetItemAsync).toHaveBeenCalledWith(
      "E2EE_EVENT_CONTENT_BOUND",
      "user-1",
    );
    await expect(provider.hydrateEncryptedEvent(legacy)).resolves.toMatchObject({
      contentUnavailable: true,
    });
    await expect(provider.refusesUnboundContent()).resolves.toBe(true);
  });

  it("does not mint new keys when other devices hold them without a password envelope", async () => {
    peekPendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "email-password",
      }),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({
            devices: [
              {
                id: "device-row",
                userId: "user-1",
                deviceId: "other-device",
                deviceLabel: null,
                publicKey: "public-key",
                publicKeyAlgorithm: "RSA-OAEP-4096",
                wrappedAccountKey: "wrapped-account-key",
                wrappedSearchKey: "wrapped-search-key",
                wrapAlgorithm: "RSA-OAEP-4096",
                keyVersion: 1,
                lastSeenAt: new Date(0),
                createdAt: new Date(0),
                updatedAt: new Date(0),
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    let lock: unknown;
    await act(async () => {
      lock = await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(lock).toBe("cannot-open");
    expect(getE2ee().isReady).toBe(false);
    expect(mockE2eeModule.generateAccountKey).not.toHaveBeenCalled();
    await expect(getE2ee().provider.hasActiveSession()).resolves.toBe(false);
    await expect(
      getE2ee().provider.attachCalendarEncryptionShadow({
        name: "Therapy",
        color: "blue",
      }),
    ).rejects.toThrow("Encryption is not ready");
  });

  it("asks a session without the sign-in password to sign in again when a password envelope exists", async () => {
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        peekPendingAuthPassword,
        lastAuthMethod: "passkey",
      }),
    );
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/e2ee/bootstrap")) {
        return jsonResponse(
          createBootstrapResponse({ passwordEnvelope: createPasswordRecord() }),
        );
      }

      if (url.endsWith("/api/e2ee/device")) {
        return jsonResponse({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    let lock: unknown;
    await act(async () => {
      lock = await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(lock).toBe("sign-in-again");
    expect(getE2ee().isReady).toBe(false);
    expect(mockE2eeModule.unwrapPasswordEnvelope).not.toHaveBeenCalled();
    expect(mockE2eeModule.generateAccountKey).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/device",
      expect.anything(),
    );
  });
});
