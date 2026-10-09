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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockPathname = "/calendar";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("@/lib/auth-client", () => ({
  useSession: jest.fn(),
}));

jest.mock("@/lib/api-clients", () => ({
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
import { accountApiService } from "@/lib/api-clients";
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
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockPathname = "/calendar";
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockReconcileAuthSession.mockReset();
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
    queryClient.clear();
  });

  async function renderGuard(strict = false) {
    const content = (
      <QueryClientProvider client={queryClient}>
        <AuthSessionGuard>
          <div>Calendar</div>
        </AuthSessionGuard>
      </QueryClientProvider>
    );
    await act(async () => {
      root.render(
        strict ? <React.StrictMode>{content}</React.StrictMode> : content,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  it("shares the startup check in Strict Mode without a second durable session read", async () => {
    mockGetAuthStatus.mockResolvedValue({
      authenticated: true,
      hasPasskeys: false,
      requiresPasskeyStepUp: false,
    });
    await renderGuard(true);
    expect(mockGetAuthStatus).toHaveBeenCalledTimes(1);
    expect(mockReconcileAuthSession).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Calendar");
  });

  it("lets the login page own its session and passkey checks", async () => {
    mockPathname = "/login";
    await renderGuard();
    expect(mockGetAuthStatus).not.toHaveBeenCalled();
    expect(mockReconcileAuthSession).not.toHaveBeenCalled();
  });

  it("keeps durable session recovery when auth status is unavailable", async () => {
    mockGetAuthStatus.mockRejectedValue(new Error("offline"));
    await renderGuard();
    expect(mockReconcileAuthSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Calendar");
  });

  it("refetches a stale client session when the durable session is gone", async () => {
    mockGetAuthStatus.mockResolvedValue({
      authenticated: false,
      hasPasskeys: false,
      requiresPasskeyStepUp: false,
    });
    mockReconcileAuthSession.mockResolvedValue({ status: "recovered" });
    const refetch = jest.fn(async () => undefined);
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" } },
      isPending: false,
      refetch,
    } as never);
    await renderGuard(true);
    expect(mockReconcileAuthSession).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
    });
  });

  it("checks passkey state again for a new session on the same account", async () => {
    mockGetAuthStatus.mockResolvedValue({
      authenticated: true,
      hasPasskeys: true,
      requiresPasskeyStepUp: false,
    });
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" }, session: { id: "session-1" } },
      isPending: false,
      refetch: jest.fn(),
    } as never);
    await renderGuard();
    mockGetAuthStatus.mockResolvedValue({
      authenticated: true,
      hasPasskeys: true,
      requiresPasskeyStepUp: true,
    });
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" }, session: { id: "session-2" } },
      isPending: false,
      refetch: jest.fn(),
    } as never);
    await renderGuard();
    expect(mockGetAuthStatus).toHaveBeenCalledTimes(2);
    expect(mockRedirectToPasskeyStepUpLogin).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Calendar");
  });

  it("sends authenticated users to login when passkey step-up is required", async () => {
    mockGetAuthStatus.mockResolvedValue({
      authenticated: true,
      hasPasskeys: true,
      requiresPasskeyStepUp: true,
    });

    await renderGuard();

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

    await renderGuard();

    expect(mockRedirectToPasskeyStepUpLogin).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Calendar");
  });
});
