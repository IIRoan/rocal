/** @jest-environment jsdom */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const mockSignOut = jest.fn();
const mockClearAuthPasswords = jest.fn();
const mockClearEncPasswordCookie = jest.fn();
const mockClearOrphanedEncPasswordCookie = jest.fn();
const mockResetE2eeBootstrap = jest.fn();
const mockGetAuthStatus = jest.fn();

jest.mock("@/lib/auth-client", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

jest.mock("@/lib/e2ee-password-cache", () => ({
  clearAuthPasswords: (...args: unknown[]) => mockClearAuthPasswords(...args),
}));

jest.mock("@/lib/enc-password-cookie", () => ({
  clearEncPasswordCookie: (...args: unknown[]) =>
    mockClearEncPasswordCookie(...args),
  clearOrphanedEncPasswordCookie: (...args: unknown[]) =>
    mockClearOrphanedEncPasswordCookie(...args),
}));

jest.mock("@/lib/e2ee-bootstrap", () => ({
  resetE2eeBootstrap: (...args: unknown[]) => mockResetE2eeBootstrap(...args),
}));

jest.mock("@/lib/account-api-service", () => ({
  accountApiService: {
    getAuthStatus: (...args: unknown[]) => mockGetAuthStatus(...args),
  },
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import {
  clearOrphanedClientAuthArtifacts,
  clearSolaceClientAuthArtifacts,
  reconcileAuthSession,
  recoverFromStaleAuthState,
  signOutAndClearLocalState,
} from "@/lib/auth-local-state";

describe("auth-local-state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined as never);
    mockGetAuthStatus.mockResolvedValue({
      authenticated: true,
      hasPasskeys: false,
      requiresPasskeyStepUp: false,
    } as never);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("clears all Solace client auth artifacts", () => {
    clearSolaceClientAuthArtifacts();

    expect(mockClearAuthPasswords).toHaveBeenCalledTimes(1);
    expect(mockClearEncPasswordCookie).toHaveBeenCalledTimes(1);
    expect(mockResetE2eeBootstrap).toHaveBeenCalledTimes(1);
  });

  it("clears only orphaned encryption artifacts when unauthenticated", async () => {
    const result = await reconcileAuthSession({ hasClientSession: false });

    expect(result).toEqual({ status: "unauthenticated" });
    expect(mockClearOrphanedEncPasswordCookie).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("recovers when the client session is not confirmed by the server", async () => {
    mockGetAuthStatus.mockResolvedValueOnce({
      authenticated: false,
      hasPasskeys: false,
      requiresPasskeyStepUp: false,
    } as never);

    const result = await reconcileAuthSession({
      hasClientSession: true,
      reason: "session-mismatch",
    });

    expect(result).toEqual({ status: "recovered" });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockClearAuthPasswords).toHaveBeenCalledTimes(1);
  });

  it("recovers when auth-status cannot be reached", async () => {
    mockGetAuthStatus.mockRejectedValueOnce(new Error("network") as never);

    const result = await reconcileAuthSession({ hasClientSession: true });

    expect(result).toEqual({ status: "recovered" });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("signs out and clears local state even when server sign-out fails", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("offline") as never);

    await signOutAndClearLocalState();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockClearEncPasswordCookie).toHaveBeenCalledTimes(1);
  });

  it("recoverFromStaleAuthState delegates to signOutAndClearLocalState", async () => {
    await recoverFromStaleAuthState("post-sign-in-unsettled");

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockResetE2eeBootstrap).toHaveBeenCalledTimes(1);
  });

  it("clearOrphanedClientAuthArtifacts only clears orphaned encryption state", () => {
    clearOrphanedClientAuthArtifacts();

    expect(mockClearOrphanedEncPasswordCookie).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
