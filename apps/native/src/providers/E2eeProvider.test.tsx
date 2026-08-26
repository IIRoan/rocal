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

jest.mock("react-native", () => ({
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    hairlineWidth: 1,
  },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock("../lib/api", () => ({
  getAuthHeaders: jest.fn(() => ({})),
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

jest.mock("@workspace/e2ee", () => ({
  ENCRYPTED_EVENT_PLACEHOLDER_TITLE: "Encrypted event",
  createE2eeModule: jest.fn(),
  hydrateEncryptedEventWithoutSession: jest.fn((event) => event),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type E2eeContextValue = ReturnType<typeof useE2ee>;

const mockGetItemAsync = jest.mocked(SecureStore.getItemAsync);
const mockSetItemAsync = jest.mocked(SecureStore.setItemAsync);
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
  unwrapPasswordEnvelope: jest.fn(),
  generateAccountKey: jest.fn(),
  generateBlindIndexKey: jest.fn(),
  createPasswordEnvelope: jest.fn(),
};

function createBootstrapResponse(
  overrides?: Partial<E2eeBootstrapResponse>,
): E2eeBootstrapResponse {
  return {
    enabled: true,
    rolloutStage: "shadow_write",
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
    signInWithPasskey: jest.fn(),
    completePasskeyStepUp: jest.fn(),
    registerPasskey: jest.fn(),
    deletePasskey: jest.fn(),
    consumePendingAuthPassword: jest.fn(() => null),
    peekPendingAuthPassword: jest.fn(() => null),
    clearPendingAuthPassword: jest.fn(),
    ...overrides,
  };
}

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
    mockCreateE2eeModule.mockReset();
    mockCreateNativeCryptoProvider.mockReset();
    mockUseAuth.mockReset();

    mockCryptoProvider.subtle.exportKey.mockReset();
    mockCryptoProvider.subtle.importKey.mockReset();
    mockE2eeModule.generateWrappingKeyPair.mockReset();
    mockE2eeModule.exportWrappingPublicKey.mockReset();
    mockE2eeModule.wrapSymmetricKey.mockReset();
    mockE2eeModule.generateDeviceId.mockReset();
    mockE2eeModule.unwrapPasswordEnvelope.mockReset();
    mockE2eeModule.generateAccountKey.mockReset();
    mockE2eeModule.generateBlindIndexKey.mockReset();
    mockE2eeModule.createPasswordEnvelope.mockReset();

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
    expect(getE2ee().isReady).toBe(true);
    expect(getE2ee().isEnabled).toBe(true);
  });

  it("starts a fresh E2EE session when the auto-unlock fails (e.g. password changed)", async () => {
    peekPendingAuthPassword.mockReturnValue("wrong-password");
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

    // Unlock failed → starts a fresh device session with newly-generated keys.
    expect(getE2ee().isReady).toBe(true);
    expect(getE2ee().isEnabled).toBe(true);
    expect(mockE2eeModule.generateAccountKey).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/device",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(clearPendingAuthPassword).toHaveBeenCalled();
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

  it("can reset the active encryption password after bootstrap completes", async () => {
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

    await expect(
      getE2ee().resetEncryptionPassword("fresh-encryption-password"),
    ).resolves.toBe(true);

    expect(mockE2eeModule.createPasswordEnvelope).toHaveBeenCalledWith(
      accountKey,
      blindIndexKey,
      "fresh-encryption-password",
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.solace.test/api/e2ee/password",
      expect.objectContaining({
        method: "PUT",
      }),
    );
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

  it("starts a fresh E2EE session for passkey users when a password envelope exists", async () => {
    // Passkey users have no pending auth password, so they can't unwrap an
    // existing password envelope. The provider should start a fresh session
    // rather than disabling E2EE.
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
});
