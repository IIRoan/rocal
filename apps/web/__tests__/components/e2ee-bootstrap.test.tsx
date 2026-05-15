/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    KeyRound: Icon,
    LogOut: Icon,
    Shield: Icon,
  };
});

jest.mock("@/lib/auth-client", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("@/lib/e2ee-bootstrap", () => ({
  ensureE2eeBootstrap: jest.fn(),
  resetE2eeBootstrap: jest.fn(),
  unlockE2eeWithPassword: jest.fn(),
}));

jest.mock("@/lib/e2ee-password-reset", () => ({
  resetEncryptionPasswordForActiveSession: jest.fn(),
}));

jest.mock("@/lib/e2ee-password-cache", () => ({
  clearAuthPasswords: jest.fn(),
  clearPendingAuthPassword: jest.fn(),
  consumePendingAuthPassword: jest.fn(),
  peekCachedAuthPassword: jest.fn(),
  peekPendingAuthPassword: jest.fn(),
}));

jest.mock("@/lib/enc-password-cookie", () => ({
  clearEncPasswordCookie: jest.fn(),
  initEncPasswordFromCookie: jest.fn(),
  setEncPasswordCookie: jest.fn(),
}));

jest.mock("@workspace/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: React.HTMLAttributes<HTMLDivElement>) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@workspace/ui/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

jest.mock("@workspace/ui/components/ui/label", () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

jest.mock("@workspace/ui/components/ui/visually-hidden", () => ({
  VisuallyHidden: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { E2eeBootstrap } from "../../components/e2ee-bootstrap";
import type { E2eeBootstrapResponse } from "../../lib/types/calendar";
import { useSession, signOut } from "@/lib/auth-client";
import {
  ensureE2eeBootstrap,
  resetE2eeBootstrap,
  unlockE2eeWithPassword,
} from "@/lib/e2ee-bootstrap";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";
import {
  clearAuthPasswords,
  clearPendingAuthPassword,
  consumePendingAuthPassword,
  peekCachedAuthPassword,
  peekPendingAuthPassword,
} from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  initEncPasswordFromCookie,
  setEncPasswordCookie,
} from "@/lib/enc-password-cookie";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const mockUseSession = jest.mocked(useSession);
const mockSignOut = jest.mocked(signOut);
const mockEnsureE2eeBootstrap = jest.mocked(ensureE2eeBootstrap);
const mockResetE2eeBootstrap = jest.mocked(resetE2eeBootstrap);
const mockUnlockE2eeWithPassword = jest.mocked(unlockE2eeWithPassword);
const mockResetEncryptionPasswordForActiveSession = jest.mocked(
  resetEncryptionPasswordForActiveSession,
);
const mockClearAuthPasswords = jest.mocked(clearAuthPasswords);
const mockClearPendingAuthPassword = jest.mocked(clearPendingAuthPassword);
const mockConsumePendingAuthPassword = jest.mocked(consumePendingAuthPassword);
const mockPeekCachedAuthPassword = jest.mocked(peekCachedAuthPassword);
const mockPeekPendingAuthPassword = jest.mocked(peekPendingAuthPassword);
const mockInitEncPasswordFromCookie = jest.mocked(initEncPasswordFromCookie);
const mockSetEncPasswordCookie = jest.mocked(setEncPasswordCookie);
const mockClearEncPasswordCookie = jest.mocked(clearEncPasswordCookie);

function createBootstrap(
  overrides?: Partial<E2eeBootstrapResponse>,
): E2eeBootstrapResponse {
  return {
    enabled: true,
    rolloutStage: "shadow_write",
    algorithms: {
      content: "AES-GCM-256",
      blindIndex: "HMAC-SHA-256",
      wrapping: "RSA-OAEP-256",
      passwordWrapping: "AES-GCM-256",
    },
    devices: [],
    passwordEnvelope: null,
    calendars: [],
    ...overrides,
  };
}

function createPasswordEnvelope(userId = "user-1") {
  return {
    id: "password-envelope-1",
    userId,
    kdfAlgorithm: "PBKDF2-SHA-256",
    kdfSalt: "salt-1",
    kdfIterations: 310000,
    wrappedAccountKey: "wrapped-account",
    wrappedSearchKey: "wrapped-search",
    wrapAlgorithm: "AES-GCM-256",
    keyVersion: 1,
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:00:00.000Z"),
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("E2eeBootstrap component", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" } },
      isPending: false,
    });
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap(),
    });
    mockPeekCachedAuthPassword.mockReturnValue(null);
    mockPeekPendingAuthPassword.mockReturnValue(null);
    mockConsumePendingAuthPassword.mockReturnValue(null);
    mockUnlockE2eeWithPassword.mockResolvedValue(true);
    mockResetEncryptionPasswordForActiveSession.mockResolvedValue(true);
    mockClearAuthPasswords.mockReset();
    mockInitEncPasswordFromCookie.mockResolvedValue(undefined);
    mockSetEncPasswordCookie.mockResolvedValue(undefined);
    mockClearEncPasswordCookie.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  async function renderComponent() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <E2eeBootstrap />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    await flushEffects();
  }

  it("shows email sign-in password unlock copy for email/password sessions", async () => {
    mockPeekPendingAuthPassword.mockReturnValue("pw");
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap({
        passwordEnvelope: createPasswordEnvelope(),
      }),
    });

    await renderComponent();

    expect(container.textContent).toContain("Unlock encrypted data");
    expect(container.textContent).toContain(
      "Solace normally reuses your email sign-in password to unlock encrypted data on this device.",
    );
    expect(container.textContent).toContain("Email sign-in password");
  });

  it("shows encryption-password unlock copy for OAuth and passkey sessions", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap({
        passwordEnvelope: createPasswordEnvelope(),
      }),
    });

    await renderComponent();

    expect(container.textContent).toContain("Unlock encrypted data");
    expect(container.textContent).toContain(
      "Enter your encryption password to unlock encrypted data on this device.",
    );
    expect(container.textContent).toContain("Encryption password");
  });

  it("shows auth-method-specific empty-submit errors in unlock mode", async () => {
    mockPeekPendingAuthPassword.mockReturnValue("pw");
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap({
        passwordEnvelope: createPasswordEnvelope(),
      }),
    });

    await renderComponent();

    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Unlock"),
    );

    await act(async () => {
      submitButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Enter your email sign-in password.",
    );
  });

  it("shows auth-method-specific wrong-password errors in unlock mode", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap({
        passwordEnvelope: createPasswordEnvelope(),
      }),
    });
    mockUnlockE2eeWithPassword.mockResolvedValue(false);

    await renderComponent();

    const passwordInput = container.querySelector(
      "#e2ee-password",
    ) as HTMLInputElement | null;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Unlock"),
    );

    await act(async () => {
      setInputValue(passwordInput as HTMLInputElement, "wrong-password");
      submitButton?.click();
      await Promise.resolve();
    });

    expect(mockUnlockE2eeWithPassword).toHaveBeenCalledWith(
      "user-1",
      "wrong-password",
    );
    expect(container.textContent).toContain(
      "That password did not unlock your encrypted data.",
    );
  });

  it("shows the email sign-in setup copy when automatic setup does not finish", async () => {
    mockPeekPendingAuthPassword.mockReturnValue("pw");
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    expect(container.textContent).toContain("Protect your encryption keys");
    expect(container.textContent).toContain(
      "Solace normally reuses your email sign-in password to protect your encryption keys.",
    );
    expect(container.textContent).toContain("Email sign-in password");
    expect(container.textContent).toContain("Confirm password");
  });

  it("shows the separate encryption-password setup copy for OAuth and passkey sessions", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    expect(container.textContent).toContain("Protect your encryption keys");
    expect(container.textContent).toContain(
      "Choose an encryption password to protect your end-to-end encryption keys for recovery and legacy device flows.",
    );
    expect(container.textContent).toContain("Encryption password");
  });

  it("auto-saves the encryption password for email sign-in users without rendering the setup dialog", async () => {
    mockPeekPendingAuthPassword.mockReturnValue("pw");
    mockConsumePendingAuthPassword.mockReturnValue("pw");
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    expect(mockResetEncryptionPasswordForActiveSession).toHaveBeenCalledWith(
      "user-1",
      "pw",
    );
    expect(container.textContent).not.toContain("Protect your encryption keys");
  });

  it("retries automatic email-password setup before showing the manual encryption dialog", async () => {
    mockPeekCachedAuthPassword.mockReturnValue("pw");
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });
    mockResetEncryptionPasswordForActiveSession
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <E2eeBootstrap />
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockResetEncryptionPasswordForActiveSession).toHaveBeenCalledTimes(
      3,
    );
    expect(
      mockResetEncryptionPasswordForActiveSession,
    ).toHaveBeenLastCalledWith("user-1", "pw");
    expect(container.textContent).not.toContain("Protect your encryption keys");
  });

  it("calls initEncPasswordFromCookie before running the bootstrap", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: null,
    });

    await renderComponent();

    expect(mockInitEncPasswordFromCookie).toHaveBeenCalled();
  });

  it("cookie-restored password auto-saves encryption without showing the setup dialog", async () => {
    // Simulate: cookie init restores a password into the cache
    mockInitEncPasswordFromCookie.mockImplementation(async () => {
      mockPeekCachedAuthPassword.mockReturnValue("cookie-pw");
      mockPeekPendingAuthPassword.mockReturnValue("cookie-pw");
    });
    mockConsumePendingAuthPassword.mockReturnValue("cookie-pw");
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    expect(mockResetEncryptionPasswordForActiveSession).toHaveBeenCalledWith(
      "user-1",
      "cookie-pw",
    );
    expect(container.textContent).not.toContain("Protect your encryption keys");
  });

  it("writes the cookie after a successful manual unlock", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap({
        passwordEnvelope: createPasswordEnvelope(),
      }),
    });

    await renderComponent();

    const passwordInput = container.querySelector(
      "#e2ee-password",
    ) as HTMLInputElement;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.includes("Unlock"),
    );

    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      );
      descriptor?.set?.call(passwordInput, "my-unlock-pw");
      passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton?.click();
      await Promise.resolve();
    });

    expect(mockSetEncPasswordCookie).toHaveBeenCalledWith("my-unlock-pw");
  });

  it("writes the cookie after a successful manual password setup", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    const passwordInput = container.querySelector(
      "#e2ee-password",
    ) as HTMLInputElement;
    const confirmInput = container.querySelector(
      "#e2ee-password-confirm",
    ) as HTMLInputElement;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.includes("Save password"),
    );

    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      );
      descriptor?.set?.call(passwordInput, "new-strong-pw!");
      passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
      descriptor?.set?.call(confirmInput, "new-strong-pw!");
      confirmInput.dispatchEvent(new Event("input", { bubbles: true }));
      submitButton?.click();
      await Promise.resolve();
    });

    expect(mockSetEncPasswordCookie).toHaveBeenCalledWith("new-strong-pw!");
  });

  it("clears the cookie and auth passwords when the user is signed out", async () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
    });

    await renderComponent();

    expect(mockClearEncPasswordCookie).toHaveBeenCalled();
    expect(mockClearAuthPasswords).toHaveBeenCalled();
  });
});
