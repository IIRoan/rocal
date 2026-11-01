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

const mockUpgradeStoredEncryption = jest.fn(async () => false);
jest.mock("@workspace/calendar-client", () => ({
  upgradeStoredEncryption: () => mockUpgradeStoredEncryption(),
}));

jest.mock("@/lib/calendar-api-service", () => ({
  calendarApiService: {
    ensureDefaultCalendars: jest.fn(async () => false),
  },
}));

jest.mock("@/lib/e2ee-bootstrap", () => ({
  ensureE2eeBootstrap: jest.fn(),
  resetE2eeBootstrap: jest.fn(),
}));

jest.mock("@/lib/e2ee-password-cache", () => ({
  clearAuthPasswords: jest.fn(),
  clearLegacyRememberedPassword: jest.fn(),
}));

jest.mock("@/lib/auth-local-state", () => ({
  endLockedSession: jest.fn(),
}));

jest.mock("@/lib/auth-navigation", () => ({
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
import { ensureE2eeBootstrap } from "@/lib/e2ee-bootstrap";
import {
  clearAuthPasswords,
  clearLegacyRememberedPassword,
} from "@/lib/e2ee-password-cache";
import { endLockedSession } from "@/lib/auth-local-state";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const mockUseSession = jest.mocked(useSession);
const mockEnsureE2eeBootstrap = jest.mocked(ensureE2eeBootstrap);
const mockClearAuthPasswords = jest.mocked(clearAuthPasswords);
const mockClearLegacyRememberedPassword = jest.mocked(
  clearLegacyRememberedPassword,
);
const mockEndLockedSession = jest.mocked(endLockedSession);

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
  expect(mockEndLockedSession).toHaveBeenCalledTimes(1);
  expect(mockEndLockedSession).toHaveBeenCalledWith(reason);
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

  it("leaves the native passkey bridge's short-lived session alone", async () => {
    mockPathname.current = "/passkey/native";
    mockEnsureE2eeBootstrap.mockResolvedValue(lockedBootstrap());

    await renderComponent();

    expect(mockEnsureE2eeBootstrap).not.toHaveBeenCalled();
    expect(mockEndLockedSession).not.toHaveBeenCalled();
  });

  it("leaves the unlock on the login page to the sign-in form, which holds the password", async () => {
    mockPathname.current = "/login";
    mockEnsureE2eeBootstrap.mockResolvedValue(lockedBootstrap());

    await renderComponent();

    expect(mockEnsureE2eeBootstrap).not.toHaveBeenCalled();
    expect(mockEndLockedSession).not.toHaveBeenCalled();
  });

  it("signs out and asks to sign in again when this browser has no key that opens the account", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue(lockedBootstrap());

    await renderComponent();

    expectSignedOutWith("sign-in-again");
    expect(mockUpgradeStoredEncryption).not.toHaveBeenCalled();
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

    expectSignedOutWith("cannot-open");
  });

  it("keeps the session when the bootstrap fails, since a network error is not a lock", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: null,
    });

    await renderComponent();

    expect(mockEndLockedSession).not.toHaveBeenCalled();
  });

  it("stays signed in without a prompt when this browser has keys but the account has no envelope", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    expect(mockEndLockedSession).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
    expect(mockUpgradeStoredEncryption).toHaveBeenCalledTimes(1);
  });

  it("re-seals what is still stored in an older form once this browser unlocks", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: true,
      bootstrap: createBootstrap(),
    });

    await renderComponent();

    expect(mockUpgradeStoredEncryption).toHaveBeenCalledTimes(1);
  });

  it("removes the password copy earlier builds kept before running the bootstrap", async () => {
    mockEnsureE2eeBootstrap.mockResolvedValue({
      activated: false,
      bootstrap: null,
    });

    await renderComponent();

    expect(mockClearLegacyRememberedPassword).toHaveBeenCalled();
    expect(
      mockClearLegacyRememberedPassword.mock.invocationCallOrder[0],
    ).toBeLessThan(mockEnsureE2eeBootstrap.mock.invocationCallOrder[0] ?? 0);
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

    expect(mockClearAuthPasswords).not.toHaveBeenCalled();
  });

  it("clears the auth passwords after a signed-in session ends", async () => {
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

    expect(mockClearAuthPasswords).toHaveBeenCalled();
  });
});
