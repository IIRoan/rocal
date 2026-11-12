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
import { createRoot, type Root } from "react-dom/client";
import type { PushTapHandler } from "../lib/push-notifications";
let PushNotificationNavigation: typeof import("./PushNotificationNavigation").PushNotificationNavigation;

const mockRouter = { replace: jest.fn() };
const mockRemove = jest.fn();
let mockAuthenticated = true;
const mockGetLastResponse = jest.fn(() => mockLastResponse);
type TapResponse = { notification: { request: { identifier: string } } };
let mockLastResponse: Promise<TapResponse | null> = Promise.resolve(null);
let mockTap:
  | ((response: { notification: { request: { identifier: string } } }) => void)
  | undefined;
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("./AuthProvider", () => ({
  useAuth: () => ({ isAuthenticated: mockAuthenticated }),
}));
jest.mock("./QueryProvider", () => ({ queryClient: {} }));
jest.mock("../lib/push-notifications", () => ({
  extractPushTapData: () => ({ eventId: "event" }),
}));
jest.mock("expo-notifications", () => ({
  getLastNotificationResponseAsync: () => mockGetLastResponse(),
  addNotificationResponseReceivedListener: (callback: typeof mockTap) => {
    mockTap = callback;
    return { remove: mockRemove };
  },
}));

const mockPendingRender = jest.fn();
const pendingUpdate = new Promise<never>(() => undefined);
function SuspendedUpdate(): React.ReactNode {
  mockPendingRender();
  throw pendingUpdate;
}
let root: Root | undefined;
beforeEach(() => {
  jest.resetModules();
  jest.doMock("react", () => React);
  ({ PushNotificationNavigation } = jest.requireActual<
    typeof import("./PushNotificationNavigation")
  >("./PushNotificationNavigation"));
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockRouter.replace.mockClear();
  mockRemove.mockClear();
  mockGetLastResponse.mockClear();
  mockAuthenticated = true;
  mockPendingRender.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
});

describe("push navigation committed props", () => {
  it("keeps the active handler and readiness when another render is suspended", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let finishLaunch: ((response: TapResponse) => void) | undefined;
    mockLastResponse = new Promise((resolve) => {
      finishLaunch = resolve;
    });
    const active: PushTapHandler = {
      route: jest.fn(() => "/event/active"),
      invalidate: jest.fn(),
    };
    const pending: PushTapHandler = {
      route: jest.fn(() => "/event/pending"),
      invalidate: jest.fn(),
    };
    const tree = (suspended: boolean) => (
      <React.Suspense fallback={null}>
        <PushNotificationNavigation
          navigationReady={!suspended}
          handler={suspended ? pending : active}
        />
        {suspended ? <SuspendedUpdate /> : null}
      </React.Suspense>
    );
    root = createRoot(document.createElement("div"));
    await act(async () => root?.render(tree(false)));
    await act(async () => {
      React.startTransition(() => root?.render(tree(true)));
    });
    expect(mockPendingRender).toHaveBeenCalled();
    await act(async () =>
      mockTap?.({ notification: { request: { identifier: "synthetic-tap" } } }),
    );
    expect(active.route).toHaveBeenCalledTimes(1);
    expect(pending.route).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/event/active");
    await act(async () => root?.render(null));
    expect(mockRemove).toHaveBeenCalledTimes(1);
    await act(async () =>
      finishLaunch?.({
        notification: { request: { identifier: "late-launch" } },
      }),
    );
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });
  it.each(["strict", "reauth"])(
    "delivers a pending cold-start response once after %s effect replay",
    async (scenario) => {
      let finish: ((response: TapResponse) => void) | undefined;
      mockLastResponse = new Promise((resolve) => {
        finish = resolve;
      });
      const handler: PushTapHandler = {
        route: jest.fn(() => "/event/launch"),
        invalidate: jest.fn(),
      };
      const content = (
        <PushNotificationNavigation navigationReady handler={handler} />
      );
      const tree =
        scenario === "strict" ? (
          <React.StrictMode>{content}</React.StrictMode>
        ) : (
          content
        );
      root = createRoot(document.createElement("div"));
      await act(async () => root?.render(tree));
      if (scenario === "reauth") {
        mockAuthenticated = false;
        await act(async () =>
          root?.render(
            <PushNotificationNavigation navigationReady handler={handler} />,
          ),
        );
        mockAuthenticated = true;
        await act(async () =>
          root?.render(
            <PushNotificationNavigation navigationReady handler={handler} />,
          ),
        );
      }
      await act(async () =>
        finish?.({ notification: { request: { identifier: "launch" } } }),
      );
      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith("/event/launch");
      expect(mockGetLastResponse).toHaveBeenCalledTimes(1);
    },
  );
});
