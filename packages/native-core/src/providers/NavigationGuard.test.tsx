/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppState } from "react-native";
import {
  SIGN_IN_TO_UNLOCK_NOTICE,
  UNLOCK_FAILED_NOTICE,
} from "@workspace/calendar-core/product-info";
import { NavigationGuard } from "./NavigationGuard";
import { QUERY_KEYS } from "../lib/query-keys";
import type { AuthenticatedSessionInput } from "../lib/startup-crypto";

const mockQueryClient = { invalidateQueries: jest.fn(async () => undefined) };
const mockSignOut = jest.fn(async (_notice?: string) => undefined);
const mockUpgradeStoredEncryption = jest.fn(async () => true);
const mockPrepareSession = jest.fn(
  async (_input: AuthenticatedSessionInput) => undefined,
);
const mockRestoreSession = jest.fn(
  async ({ userId }: Pick<AuthenticatedSessionInput, "userId">) =>
    userId === "restored",
);
let mockBootstrap = jest.fn(() => new Promise<string | null>(() => undefined));
let mockPlatform: "ios" | "android" = "ios";
let mockE2eeReady = false;
let mockAuth: {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id: string; email: string; name: string } | null;
  signOut: typeof mockSignOut;
};

jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  View: ({
    children,
    accessibilityElementsHidden,
    importantForAccessibility,
  }: {
    children?: ReactNode;
    accessibilityElementsHidden?: boolean;
    importantForAccessibility?: string;
  }) => (
    <div
      aria-hidden={
        mockPlatform === "ios"
          ? accessibilityElementsHidden
          : importantForAccessibility === "no-hide-descendants"
      }
    >
      {children}
    </div>
  ),
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
    get isReady() { return mockE2eeReady; },
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
jest.mock("../lib/launch-splash", () => ({
  hideLaunchSplash: () => undefined,
}));
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
        restoreSession={mockRestoreSession}
        prepareSession={mockPrepareSession}
        pushTapHandler={{ route: () => null, invalidate: () => undefined }}
        notificationExtensionSecrets={{
          mailAuth: false,
          notificationKey: false,
        }}
      >
        <button data-testid="workspace-action">Create event</button>
      </NavigationGuard>,
    );
  });
};

beforeEach(() => {
  mockSignOut.mockClear();
  mockUpgradeStoredEncryption.mockClear();
  mockPrepareSession.mockReset().mockResolvedValue(undefined);
  mockRestoreSession.mockClear();
  jest.mocked(AppState.addEventListener).mockClear();
  AppState.currentState = "active";
  mockBootstrap = jest.fn(() => new Promise<string | null>(() => undefined));
  mockPlatform = "ios";
  mockE2eeReady = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
  container.remove();
});

it.each(["ios", "android"] as const)("hides workspace actions from accessibility while preparing encryption on %s", async (platform) => {
  mockPlatform = platform;
  signIn("fresh");
  await renderGuard();

    expect(
      container.querySelector('[data-testid="workspace-action"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="workspace-action"]')
        ?.closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  },
);

it("keeps a restored encrypted workspace accessible during background startup", async () => {
  signIn("restored");
  await renderGuard();

  expect(
    container
      .querySelector('[data-testid="workspace-action"]')
      ?.closest('[aria-hidden="true"]'),
  ).toBeNull();
});

it("exposes workspace actions after encryption startup completes", async () => {
  mockE2eeReady = true;
  mockBootstrap = jest.fn(() => Promise.resolve(null));
  signIn("ready");
  await renderGuard();

  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(
    container
      .querySelector('[data-testid="workspace-action"]')
      ?.closest('[aria-hidden="true"]'),
  ).toBeNull();
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
  },
);

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
    queryKey: QUERY_KEYS.settings(),
  });
});

it.each(["offline", "503"])(
  "retries a failed %s unlock without relaunching or repeating offline restoration",
  async (failure) => {
    jest.useFakeTimers();
    mockBootstrap = jest
      .fn()
      .mockRejectedValueOnce(new Error(failure))
      .mockResolvedValue(null);
    signIn("restored");
    await renderGuard();

    expect(mockPrepareSession).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockBootstrap).toHaveBeenCalledTimes(2);
    expect(mockRestoreSession).toHaveBeenCalledTimes(1);
    expect(mockPrepareSession).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  },
);

it("backs off repeated failures and stops retrying after recovery", async () => {
  jest.useFakeTimers();
  mockBootstrap = jest
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("503"))
    .mockResolvedValue(null);
  signIn("fresh");
  await renderGuard();
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(mockBootstrap).toHaveBeenCalledTimes(2);
  await act(async () => {
    jest.advanceTimersByTime(1999);
  });
  expect(mockBootstrap).toHaveBeenCalledTimes(2);
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(mockBootstrap).toHaveBeenCalledTimes(3);
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  expect(mockBootstrap).toHaveBeenCalledTimes(3);
  expect(mockPrepareSession).toHaveBeenCalledTimes(1);
});

it("retries mail preparation without resetting successfully unlocked account keys", async () => {
  jest.useFakeTimers();
  mockBootstrap = jest.fn().mockResolvedValue(null);
  mockPrepareSession
    .mockRejectedValueOnce(new Error("503"))
    .mockResolvedValue(undefined);
  signIn("restored");
  await renderGuard();
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });

  expect(mockBootstrap).toHaveBeenCalledTimes(1);
  expect(mockPrepareSession).toHaveBeenCalledTimes(2);
  expect(mockRestoreSession).toHaveBeenCalledTimes(1);
});

it("retries immediately on foreground return without overlapping startup", async () => {
  jest.useFakeTimers();
  mockBootstrap = jest.fn().mockRejectedValueOnce(new Error("offline"));
  signIn("fresh");
  await renderGuard();
  const listener = jest
    .mocked(AppState.addEventListener)
    .mock.calls.at(-1)?.[1];
  expect(listener).toBeDefined();
  mockBootstrap.mockImplementation(() => new Promise(() => undefined));
  await act(async () => {
    listener?.("active");
    listener?.("active");
  });

  expect(mockBootstrap).toHaveBeenCalledTimes(2);
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  expect(mockBootstrap).toHaveBeenCalledTimes(2);
});

it("cancels pending retries when the user signs out", async () => {
  jest.useFakeTimers();
  mockBootstrap = jest.fn().mockRejectedValue(new Error("offline"));
  signIn("restored");
  await renderGuard();
  mockAuth = { ...mockAuth, isAuthenticated: false, user: null };
  await renderGuard();
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });

  expect(mockBootstrap).toHaveBeenCalledTimes(1);
  expect(mockPrepareSession).not.toHaveBeenCalled();
});

it("waits for foreground return before retrying a backgrounded session", async () => {
  jest.useFakeTimers();
  mockBootstrap = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(null);
  signIn("restored");
  await renderGuard();
  AppState.currentState = "background";
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(mockBootstrap).toHaveBeenCalledTimes(1);
  const listener = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1];
  AppState.currentState = "active";
  await act(async () => { listener?.("active"); });

  expect(mockBootstrap).toHaveBeenCalledTimes(2);
  expect(mockPrepareSession).toHaveBeenCalledTimes(1);
});

it("ignores an old account's late lock after another account starts", async () => {
  let finishOldBootstrap: ((lock: string | null) => void) | undefined;
  mockBootstrap = jest.fn().mockImplementationOnce(() => new Promise<string | null>((resolve) => {
    finishOldBootstrap = resolve;
  })).mockResolvedValue(null);
  signIn("restored");
  await renderGuard();
  signIn("fresh");
  await renderGuard();
  await act(async () => { finishOldBootstrap?.("cannot-open"); });

  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockPrepareSession).toHaveBeenCalledTimes(1);
  expect(mockPrepareSession.mock.calls[0]?.[0].userId).toBe("fresh");
});

it("cancels pending retries when the guard unmounts", async () => {
  jest.useFakeTimers();
  mockBootstrap = jest.fn().mockRejectedValue(new Error("offline"));
  signIn("restored");
  await renderGuard();
  await act(async () => {
    root.render(null);
  });
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });

  expect(mockBootstrap).toHaveBeenCalledTimes(1);
  expect(mockPrepareSession).not.toHaveBeenCalled();
});
