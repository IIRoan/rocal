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

jest.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
}));

jest.mock("@/lib/auth-client", () => ({
  useSession: jest.fn(),
}));

jest.mock("@/lib/account-api-service", () => ({
  accountApiService: {
    getAuthStatus: jest.fn(),
  },
}));

jest.mock("@/lib/auth-local-state", () => ({
  reconcileAuthSession: jest.fn(),
}));

jest.mock("@/lib/auth-navigation", () => ({
  isPasskeyStepUpExemptPath: (pathname: string) => pathname === "/login",
  redirectToPasskeyStepUpLogin: jest.fn(),
}));

jest.mock("@workspace/ui/components/ui", () => ({
  PageLoadingOverlay: () => <div data-testid="loading-overlay">Loading</div>,
}));

import { useSession } from "@/lib/auth-client";
import { accountApiService } from "@/lib/account-api-service";
import { reconcileAuthSession } from "@/lib/auth-local-state";
import { redirectToPasskeyStepUpLogin } from "@/lib/auth-navigation";
import { AuthSessionGuard } from "../../components/auth-session-guard";

const mockUseSession = jest.mocked(useSession);
const mockGetAuthStatus = jest.mocked(accountApiService.getAuthStatus);
const mockReconcileAuthSession = jest.mocked(reconcileAuthSession);
const mockRedirectToPasskeyStepUpLogin = jest.mocked(
  redirectToPasskeyStepUpLogin,
);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("AuthSessionGuard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockUseSession.mockReturnValue({
      data: {
        user: { id: "user-1" },
      },
      isPending: false,
      refetch: jest.fn(),
    } as never);
    mockReconcileAuthSession.mockResolvedValue({
      status: "authenticated",
    } as never);
    mockGetAuthStatus.mockReset();
    mockRedirectToPasskeyStepUpLogin.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("sends authenticated users to login when passkey step-up is required", async () => {
    mockGetAuthStatus.mockResolvedValue({
      authenticated: true,
      hasPasskeys: true,
      requiresPasskeyStepUp: true,
    });

    await act(async () => {
      root.render(
        <AuthSessionGuard>
          <div>Calendar</div>
        </AuthSessionGuard>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRedirectToPasskeyStepUpLogin).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Calendar");
    expect(container.textContent).toContain("Loading");
  });

  it("renders the app once passkey step-up is not required", async () => {
    mockGetAuthStatus.mockResolvedValue({
      authenticated: true,
      hasPasskeys: true,
      requiresPasskeyStepUp: false,
    });

    await act(async () => {
      root.render(
        <AuthSessionGuard>
          <div>Calendar</div>
        </AuthSessionGuard>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRedirectToPasskeyStepUpLogin).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Calendar");
  });
});
