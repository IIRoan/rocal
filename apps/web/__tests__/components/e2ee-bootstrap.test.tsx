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

jest.mock("@/lib/auth-client", () => ({
  useSession: jest.fn(),
}));

const mockSealReadableInvitations = jest.fn(async () => undefined);
jest.mock("@workspace/calendar-client", () => ({
  sealReadableInvitations: () => mockSealReadableInvitations(),
}));

jest.mock("@/lib/calendar-api-service", () => ({
  calendarApiService: {
    ensureDefaultCalendars: jest.fn(async () => false),
    ensureSealedUserSettings: jest.fn(async () => false),
  },
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
  peekAuthPassword: jest.fn(),
}));

jest.mock("@/lib/enc-password-cookie", () => ({
  clearEncPasswordCookie: jest.fn(),
  initEncPasswordFromCookie: jest.fn(),
}));

jest.mock("@/lib/auth-local-state", () => ({
  signOutAndClearLocalState: jest.fn(),
}));

const mockFinishNavigation = jest.fn();
jest.mock("@/lib/auth-navigation", () => ({
  beginAuthNavigation: jest.fn(() => mockFinishNavigation),
  buildE2eeLockLoginHref: (reason: string) => `/login?e2ee=${reason}`,
  isPasskeyBridgePath: (pathname: string | null) =>
    pathname === "/passkey/native",
}));

const mockPathname = { current: "/calendar" };
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));

import { E2eeBootstrap } from "../../components/e2ee-bootstrap";
import { authSessionDataFixture } from "../mocks/auth-session";
import type { E2eeBootstrapResponse } from "../../lib/types/calendar";
import { useSession } from "@/lib/auth-client";
import {
  ensureE2eeBootstrap,
  unlockE2eeWithPassword,
} from "@/lib/e2ee-bootstrap";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";
import {
  clearAuthPasswords,
  peekAuthPassword,
} from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  initEncPasswordFromCookie,
} from "@/lib/enc-password-cookie";
import { signOutAndClearLocalState } from "@/lib/auth-local-state";
import { beginAuthNavigation } from "@/lib/auth-navigation";
import { calendarApiService } from "@/lib/calendar-api-service";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const mockUseSession = jest.mocked(useSession);
const mockEnsureE2eeBootstrap = jest.mocked(ensureE2eeBootstrap);
const mockUnlockE2eeWithPassword = jest.mocked(unlockE2eeWithPassword);
const mockResetEncryptionPasswordForActiveSession = jest.mocked(
  resetEncryptionPasswordForActiveSession,
);
const mockClearAuthPasswords = jest.mocked(clearAuthPasswords);
const mockPeekAuthPassword = jest.mocked(peekAuthPassword);
const mockInitEncPasswordFromCookie = jest.mocked(initEncPasswordFromCookie);
const mockClearEncPasswordCookie = jest.mocked(clearEncPasswordCookie);
const mockSignOut = jest.mocked(signOutAndClearLocalState);
const mockBeginAuthNavigation = jest.mocked(beginAuthNavigation);

function createBootstrap(
  overrides?: Partial<E2eeBootstrapResponse>,
): E2eeBootstrapResponse {
  return {
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

function lockedBootstrap(extras?: { passwordUnlockFailed?: boolean }) {
  return {
    activated: false,
    bootstrap: createBootstrap({ passwordEnvelope: createPasswordEnvelope() }),
    ...extras,
  };
}

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function expectSignedOutWith(reason: string) {
  expect(mockBeginAuthNavigation).toHaveBeenCalledWith(`/login?e2ee=${reason}`);
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockFinishNavigation).toHaveBeenCalled();
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
      data: authSessionDataFixture,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(async () => undefined),
    });
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap(),
    });
    mockPeekAuthPassword.mockReturnValue(null);
    mockUnlockE2eeWithPassword.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });
    mockResetEncryptionPasswordForActiveSession.mockResolvedValue(true);
    mockInitEncPasswordFromCookie.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
    mockPathname.current = "/calendar";
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

  it("never renders an unlock or setup prompt", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue(
      lockedBootstrap({ passwordUnlockFailed: true }),
    );

    await renderComponent();

    expect(container.innerHTML).toBe("");
  });

  it("unlocks with the sign-in password that arrived after bootstrap and stays signed in", async () => {
    mockPeekAuthPassword.mockReturnValue("pw");
    mockEnsureE2eeBootstrap.mockResolvedValue(lockedBootstrap());

    await renderComponent();

    expect(mockUnlockE2eeWithPassword).toHaveBeenCalledWith("user-1", "pw");
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockSealReadableInvitations).toHaveBeenCalledTimes(1);
  });

  it("leaves the native passkey bridge's short-lived session alone", async () => {
    mockPathname.current = "/passkey/native";
    mockEnsureE2eeBootstrap.mockResolvedValue(lockedBootstrap());

    await renderComponent();

    expect(mockEnsureE2eeBootstrap).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signs out and asks to sign in again when no password can open the envelope", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue(lockedBootstrap());

    await renderComponent();

    expect(mockUnlockE2eeWithPassword).not.toHaveBeenCalled();
    expectSignedOutWith("sign-in");
    expect(mockSealReadableInvitations).not.toHaveBeenCalled();
  });

  it("signs out with the support notice when the sign-in password does not open the envelope", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue(
      lockedBootstrap({ passwordUnlockFailed: true }),
    );

    await renderComponent();

    expectSignedOutWith("failed");
  });

  it("signs out with the support notice when a late password does not open the envelope", async () => {
    mockPeekAuthPassword.mockReturnValue("wrong");
    mockEnsureE2eeBootstrap.mockResolvedValue(lockedBootstrap());
    mockUnlockE2eeWithPassword.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap(),
      passwordUnlockFailed: true,
    });

    await renderComponent();

    expectSignedOutWith("failed");
  });

  it("signs out with the support notice when keys exist only on other devices", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: createBootstrap({
        devices: [
          {
            id: "device-row-1",
            userId: "user-1",
            deviceId: "other-device",
            deviceLabel: null,
            publicKey: "public",
            publicKeyAlgorithm: "RSA-OAEP-256",
            wrappedAccountKey: "wrapped-account",
            wrappedSearchKey: "wrapped-search",
            wrapAlgorithm: "RSA-OAEP-256",
            keyVersion: 1,
            lastSeenAt: new Date("2026-05-01T12:00:00.000Z"),
            createdAt: new Date("2026-05-01T12:00:00.000Z"),
            updatedAt: new Date("2026-05-01T12:00:00.000Z"),
          },
        ],
      }),
    });

    await renderComponent();

    expectSignedOutWith("failed");
  });

  it("keeps the session when the bootstrap fails, since a network error is not a lock", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: null,
    });

    await renderComponent();

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("keeps the session when a late unlock hits a network error", async () => {
    mockPeekAuthPassword.mockReturnValue("pw");
    mockEnsureE2eeBootstrap.mockResolvedValue(lockedBootstrap());
    mockUnlockE2eeWithPassword.mockRejectedValue(new Error("offline"));

    await renderComponent();

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("stays signed in without a prompt when this browser has keys but the account has no envelope", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    expect(mockResetEncryptionPasswordForActiveSession).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
    expect(mockSealReadableInvitations).toHaveBeenCalledTimes(1);
  });

  it("seals plaintext app preferences once this browser unlocks", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    expect(calendarApiService.ensureSealedUserSettings).toHaveBeenCalled();
  });

  it("stores the missing envelope with the sign-in password when one is at hand", async () => {
    mockPeekAuthPassword.mockReturnValue("pw");
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });
    mockResetEncryptionPasswordForActiveSession
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await renderComponent();

    expect(mockResetEncryptionPasswordForActiveSession).toHaveBeenCalledTimes(2);
    expect(mockResetEncryptionPasswordForActiveSession).toHaveBeenLastCalledWith(
      "user-1",
      "pw",
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("calls initEncPasswordFromCookie before running the bootstrap", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: null,
    });

    await renderComponent();

    expect(mockInitEncPasswordFromCookie).toHaveBeenCalled();
  });

  it("does not clear cached passwords on an initial anonymous render", async () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(async () => undefined),
    });

    await renderComponent();

    expect(mockClearEncPasswordCookie).not.toHaveBeenCalled();
    expect(mockClearAuthPasswords).not.toHaveBeenCalled();
  });

  it("clears the cookie and auth passwords after a signed-in session ends", async () => {
    await renderComponent();

    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(async () => undefined),
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <E2eeBootstrap />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    await flushEffects();

    expect(mockClearEncPasswordCookie).toHaveBeenCalled();
    expect(mockClearAuthPasswords).toHaveBeenCalled();
  });
});
