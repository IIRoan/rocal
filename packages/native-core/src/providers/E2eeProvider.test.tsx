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
  const actual = jest.requireActual<typeof import("@workspace/e2ee")>(
    "@workspace/e2ee",
  );
  return {
    ENCRYPTED_EVENT_PLACEHOLDER_TITLE: "Encrypted event",
    createE2eeModule: jest.fn(),
    hydrateEncryptedEventWithoutSession: jest.fn((event) => event),
    encryptEventContentRequest: actual.encryptEventContentRequest,
    encryptNameRequest: actual.encryptNameRequest,
    hydrateEncryptedName: actual.hydrateEncryptedName,
    lockWithoutDeviceKeys: actual.lockWithoutDeviceKeys,
    resolveDeviceEnvelopeSalt: actual.resolveDeviceEnvelopeSalt,
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

function storeDevice(envelopeSalt: string | null) {
  const stored: Record<string, string | null> = {
    E2EE_DEVICE_ID: "device-1",
    E2EE_PRIVATE_KEY: '{"kty":"RSA"}',
    E2EE_ENVELOPE_SALT: envelopeSalt,
  };
  mockGetItemAsync.mockImplementation(async (key: string) => stored[key] ?? null);
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

function createPasswordRecord(): E2eePasswordRecord {
  return {
    id: "password-record-1",
    userId: "user-1",
    kdfAlgorithm: "PBKDF2-SHA-256",
    kdfSalt: "salt",
    kdfIterations: 310000,
    wrappedAccountKey: "wrapped-account",
    wrappedSearchKey: "wrapped-search",
    wrapAlgorithm: "AES-GCM-256",
    keyVersion: 1,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-01T00:00:00.000Z"),
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
      kdfAlgorithm: "PBKDF2-SHA-256",
      kdfSalt: "salt",
      kdfIterations: 310000,
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
    expect(mockSetItemAsync).toHaveBeenLastCalledWith("E2EE_ENVELOPE_SALT", "salt");
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
    expect(getE2ee().isReady).toBe(true);
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

  it("clears the pending auth password when auto-storing the envelope fails", async () => {
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
        return new Response("nope", { status: 500 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await renderProvider();

    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });
    await flushBootstrap();

    expect(getE2ee().isReady).toBe(true);
    expect(clearPendingAuthPassword).toHaveBeenCalled();
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
  ])("verifies a restored device key with the sign-in password when %s", async (_case, sameKey, marker) => {
    storeDevice(null);
    peekPendingAuthPassword.mockReturnValue("secret-password");
    mockCryptoProvider.subtle.importKey.mockResolvedValue({ kid: "private" });
    mockE2eeModule.unwrapAccountKey.mockResolvedValue(accountKey);
    mockE2eeModule.unwrapBlindIndexKey.mockResolvedValue(blindIndexKey);
    mockE2eeModule.unwrapPasswordEnvelope.mockResolvedValue({
      accountKey: { type: "envelope-account-key" },
      blindIndexKey,
    });
    mockE2eeModule.encryptJsonPayload.mockResolvedValue({ ciphertext: "probe" });
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

    expect(getActiveE2eeSession()).toMatchObject({ deviceId: "device-1", accountKey });
    expect(
      mockSetItemAsync.mock.calls.find(([key]) => key === "E2EE_ENVELOPE_SALT")?.[1],
    ).toBe(marker);
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
    mockE2eeModule.unwrapAccountKey.mockRejectedValue(new Error("OperationError"));
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

  it.each([
    ["deletes the device key the envelope is known to hold", "salt", true],
    ["keeps a device key no envelope is known to hold", null, false],
  ])("%s on sign-out", async (_case, marker, deleted) => {
    storeDevice(marker);

    await clearRecoverableStoredDevice();

    expect(mockDeleteItemAsync.mock.calls.map(([key]) => key)).toEqual(
      deleted ? ["E2EE_DEVICE_ID", "E2EE_PRIVATE_KEY", "E2EE_ENVELOPE_SALT"] : [],
    );
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

    await expect(getE2ee().createPasswordEnvelope("fresh-password")).rejects.toThrow(
      "not unlocked",
    );
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
    mockE2eeModule.createBlindIndexTokens.mockResolvedValue(["idx"]);
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
    });
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
    expect(JSON.stringify([event, calendar])).not.toMatch(/Therapy|Notes|Clinic/);
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
    expect(getE2ee().isReady).toBe(true);
    expect(mockE2eeModule.generateAccountKey).not.toHaveBeenCalled();
    await expect(getE2ee().provider.hasActiveSession()).resolves.toBe(false);
    await expect(
      getE2ee().provider.attachCalendarEncryptionShadow({ name: "Therapy", color: "blue" }),
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
    expect(getE2ee().isReady).toBe(true);
    expect(mockE2eeModule.unwrapPasswordEnvelope).not.toHaveBeenCalled();
    expect(mockE2eeModule.generateAccountKey).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/device",
      expect.anything(),
    );
  });
});
