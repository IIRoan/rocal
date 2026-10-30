/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  SIGN_IN_TO_UNLOCK_NOTICE,
  UNLOCK_FAILED_NOTICE,
} from "@workspace/calendar-core/product-info";
import { NavigationGuard } from "./NavigationGuard";

const mockQueryClient = { invalidateQueries: jest.fn(async () => undefined) };
const mockSignOut = jest.fn(async (_notice?: string) => undefined);
const mockUpgradeStoredEncryption = jest.fn(async () => true);
let mockBootstrap = jest.fn(() => new Promise<string | null>(() => undefined));
let mockAuth: {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id: string; email: string; name: string } | null;
  signOut: typeof mockSignOut;
};

jest.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSegments: () => [],
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock("./AuthProvider", () => ({ useAuth: () => mockAuth }));

jest.mock("./E2eeProvider", () => {
  const e2ee = {
    isReady: false,
    bootstrap: (...args: unknown[]) => mockBootstrap(...(args as [])),
    clearSession: () => undefined,
    provider: null,
  };
  return { useE2ee: () => e2ee };
});

jest.mock("./PushNotificationNavigation", () => ({
  PushNotificationNavigation: () => null,
}));

jest.mock("../components/WorkspaceLoadingScreen", () => ({
  WorkspaceLoadingScreen: ({
    active,
    message,
  }: {
    active: boolean;
    message: string;
  }) => (active ? <p role="status">{message}</p> : null),
}));

jest.mock("@workspace/calendar-client", () => ({
  ...jest.requireActual<object>("@workspace/calendar-client"),
  upgradeStoredEncryption: () => mockUpgradeStoredEncryption(),
}));

jest.mock("../lib/api", () => ({
  calendarApiService: {
    setE2eeProvider: () => undefined,
    ensureDefaultCalendars: () => Promise.resolve(false),
  },
}));
jest.mock("../lib/session-query-reset", () => ({
  resetPreSessionQueries: () => Promise.resolve(),
}));

jest.mock("../lib/auth-routing", () => ({
  getAuthRedirectPath: () => null,
}));

jest.mock("../lib/constants", () => ({ API_BASE_URL: "https://api.test" }));
jest.mock("../lib/launch-splash", () => ({ hideLaunchSplash: () => undefined }));
jest.mock("../hooks/use-notification-extension-sync", () => ({
  useNotificationExtensionSync: () => undefined,
}));
jest.mock("../hooks/use-account-timezone-seed", () => ({
  useAccountTimezoneSeed: () => undefined,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let container: HTMLDivElement;

const signIn = (id: string) => {
  mockAuth = {
    isAuthenticated: true,
    isLoading: false,
    user: { id, email: `${id}@solace.test`, name: id },
    signOut: mockSignOut,
  };
};

const renderGuard = async () => {
  await act(async () => {
    root.render(
      <NavigationGuard
        homeRoute="/home"
        restoreSession={({ userId }) => Promise.resolve(userId === "restored")}
        pushTapHandler={{ route: () => null, invalidate: () => undefined }}
        notificationExtensionSecrets={{ mailAuth: false, notificationKey: false }}
      >
        {null}
      </NavigationGuard>,
    );
  });
};

beforeEach(() => {
  mockSignOut.mockClear();
  mockUpgradeStoredEncryption.mockClear();
  mockBootstrap = jest.fn(() => new Promise<string | null>(() => undefined));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("drops the previous user's restored workspace when another user signs in", async () => {
  signIn("restored");
  await renderGuard();
  expect(container.querySelector('[role="status"]')).toBeNull();

  signIn("fresh");
  await renderGuard();
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "Setting up encryption…",
  );
});

it.each([
  ["sign-in-again", SIGN_IN_TO_UNLOCK_NOTICE],
  ["cannot-open", UNLOCK_FAILED_NOTICE],
])("ends a session that cannot open the account key (%s) instead of asking for a password", async (lock, notice) => {
  mockBootstrap = jest.fn(() => Promise.resolve(lock));
  signIn("locked");
  await renderGuard();
  await act(async () => {
    await Promise.resolve();
  });

  expect(mockSignOut).toHaveBeenCalledWith(notice);
  expect(mockUpgradeStoredEncryption).not.toHaveBeenCalled();
});

it("keeps a session whose startup unlocked and re-seals what is still stored in an older form", async () => {
  mockBootstrap = jest.fn(() => Promise.resolve(null));
  signIn("unlocked");
  await renderGuard();
  await act(async () => {
    await Promise.resolve();
  });

  expect(mockBootstrap).toHaveBeenCalled();
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockUpgradeStoredEncryption).toHaveBeenCalledTimes(1);
});

it("refetches settings once the upgrade sealed them", async () => {
  mockBootstrap = jest.fn(() => Promise.resolve(null));
  signIn("sealing");
  await renderGuard();
  await act(async () => {
    await Promise.resolve();
  });

  expect(mockUpgradeStoredEncryption).toHaveBeenCalled();
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["settings"],
  });
});
