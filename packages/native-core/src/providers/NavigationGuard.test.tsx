/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NavigationGuard } from "./NavigationGuard";

const mockQueryClient = {};
let mockAuth: {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id: string; email: string; name: string } | null;
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
    bootstrap: () => new Promise<boolean>(() => undefined),
    clearSession: () => undefined,
    provider: null,
  };
  return { useE2ee: () => e2ee };
});

jest.mock("./PushNotificationNavigation", () => ({
  PushNotificationNavigation: () => null,
}));

jest.mock("../components/E2eeUnlockSheet", () => ({
  E2eeUnlockSheet: () => null,
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

jest.mock("../lib/api", () => ({
  calendarApiService: { setE2eeProvider: () => undefined },
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
