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
import { useTheme } from "./ThemeProvider";
import { E2eeProvider, useE2ee } from "./E2eeProvider";

jest.mock("react-native", () => {
  const React = jest.requireActual<typeof import("react")>("react");

  return {
    ActivityIndicator: () => <div data-testid="activity-indicator" />,
    KeyboardAvoidingView: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Modal: ({
      children,
      visible,
    }: {
      children: React.ReactNode;
      visible?: boolean;
    }) => (visible ? <div data-testid="modal">{children}</div> : null),
    Platform: {
      OS: "ios",
    },
    Pressable: ({
      children,
      disabled,
      onPress,
    }: {
      children:
        | React.ReactNode
        | ((state: { pressed: boolean }) => React.ReactNode);
      disabled?: boolean;
      onPress?: () => void;
    }) => (
      <button type="button" disabled={disabled} onClick={onPress}>
        {typeof children === "function"
          ? children({ pressed: false })
          : children}
      </button>
    ),
    StyleSheet: {
      create: <T,>(styles: T) => styles,
      hairlineWidth: 1,
    },
    Text: ({ children }: { children: React.ReactNode }) => (
      <span>{children}</span>
    ),
    TextInput: ({
      value,
      onChangeText,
      secureTextEntry,
      editable = true,
    }: {
      value?: string;
      onChangeText?: (value: string) => void;
      secureTextEntry?: boolean;
      editable?: boolean;
    }) => (
      <input
        value={value}
        type={secureTextEntry ? "password" : "text"}
        disabled={!editable}
        onChange={(event) =>
          onChangeText?.((event.target as HTMLInputElement).value)
        }
      />
    ),
    View: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

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

jest.mock("./ThemeProvider", () => ({
  useTheme: jest.fn(),
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
const mockUseTheme = jest.mocked(useTheme);

const mockTheme = {
  spacing: {
    "2": 8,
    "2.5": 10,
    "3": 12,
    "4": 16,
  },
  borderRadius: {
    lg: 12,
    xl: 16,
  },
  colors: {
    border: "#d4d4d8",
    card: "#ffffff",
    foreground: "#18181b",
    mutedForeground: "#52525b",
    input: "#ffffff",
    destructive: "#dc2626",
    accent: "#f4f4f5",
    primaryBase: "#ef5a3c",
    primaryForeground: "#ffffff",
  },
  typography: {
    fontSize: {
      base: { size: 16, lineHeight: 24 },
      sm: { size: 14, lineHeight: 20 },
    },
    fontWeight: {
      medium: "500",
      semibold: "600",
    },
  },
  shadows: {},
} as const;

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

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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
    registerPasskey: jest.fn(),
    deletePasskey: jest.fn(),
    consumePendingAuthPassword: jest.fn(() => null),
    clearPendingAuthPassword: jest.fn(),
    ...overrides,
  };
}

function createMockThemeContext(): ReturnType<typeof useTheme> {
  return {
    theme: mockTheme as unknown as ReturnType<typeof useTheme>["theme"],
    colorScheme: "light",
    isDark: false,
    themePreference: "system",
    setThemePreference: jest.fn(),
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
  let consumePendingAuthPassword: jest.Mock;
  let clearPendingAuthPassword: jest.Mock;
  let signOut: jest.Mock;

  function E2eeProbe() {
    capturedE2ee = useE2ee();
    return (
      <div data-testid="e2ee-status">
        {capturedE2ee.isReady ? "ready" : "not-ready"}:
        {capturedE2ee.isEnabled ? "enabled" : "disabled"}
      </div>
    );
  }

  async function renderProvider() {
    await act(async () => {
      root.render(
        <E2eeProvider>
          <E2eeProbe />
        </E2eeProvider>,
      );
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
    capturedE2ee = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockFetch = jest.fn();
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetch as typeof fetch;

    consumePendingAuthPassword = jest.fn().mockReturnValue(null);
    clearPendingAuthPassword = jest.fn();
    signOut = jest.fn().mockResolvedValue(undefined);

    mockGetItemAsync.mockReset();
    mockSetItemAsync.mockReset();
    mockCreateE2eeModule.mockReset();
    mockCreateNativeCryptoProvider.mockReset();
    mockUseAuth.mockReset();
    mockUseTheme.mockReset();

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
        lastAuthMethod: "unknown",
        signOut,
      }),
    );
    mockUseTheme.mockReturnValue(createMockThemeContext());

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
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("auto-unlocks a password envelope with the pending email sign-in password", async () => {
    consumePendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        lastAuthMethod: "email-password",
        signOut,
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
    expect(container.textContent).not.toContain("Unlock encrypted data");
    expect(getE2ee().isReady).toBe(true);
    expect(getE2ee().isEnabled).toBe(true);
  });

  it("shows the email-password unlock gate when automatic unlock fails", async () => {
    consumePendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        lastAuthMethod: "email-password",
        signOut,
      }),
    );
    mockE2eeModule.unwrapPasswordEnvelope.mockRejectedValue(
      new Error("wrong password"),
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

    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });

    expect(container.textContent).toContain("Unlock encrypted data");
    expect(container.textContent).toContain(
      "Solace normally reuses your email sign-in password to unlock encrypted data on this device. If that did not finish automatically, enter the same password here. If you recently changed it, use your previous password.",
    );
    expect(container.textContent).toContain("Email sign-in password");
  });

  it("auto-saves a password envelope for first-device email sign-in", async () => {
    consumePendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        lastAuthMethod: "email-password",
        signOut,
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
    expect(container.textContent).not.toContain("Protect your encryption keys");
  });

  it("can reset the active encryption password after bootstrap completes", async () => {
    consumePendingAuthPassword.mockReturnValue("secret-password");
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        lastAuthMethod: "email-password",
        signOut,
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

  it("shows the separate encryption-password setup gate for passkey sign-in", async () => {
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        lastAuthMethod: "passkey",
        signOut,
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

    expect(container.textContent).toContain("Protect your encryption keys");
    expect(container.textContent).toContain(
      "Choose an encryption password to protect your end-to-end encryption keys for recovery and legacy device flows.",
    );
    expect(container.textContent).toContain("Encryption password");
    expect(container.textContent).toContain("Save password");
  });

  it("shows the separate encryption-password error when passkey unlock fails", async () => {
    mockUseAuth.mockReturnValue(
      createMockAuthContext({
        clearPendingAuthPassword,
        consumePendingAuthPassword,
        lastAuthMethod: "passkey",
        signOut,
      }),
    );
    mockE2eeModule.unwrapPasswordEnvelope.mockRejectedValue(
      new Error("wrong password"),
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

    await act(async () => {
      await getE2ee().bootstrap("user-1", "https://api.solace.test");
    });

    const [passwordInput] = Array.from(container.querySelectorAll("input"));
    const unlockButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Unlock",
    );

    await act(async () => {
      setInputValue(passwordInput as HTMLInputElement, "incorrect-password");
      unlockButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "That password did not unlock your encrypted data.",
    );
  });
});
