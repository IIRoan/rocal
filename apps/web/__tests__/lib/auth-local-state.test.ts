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
const mockGetSession = jest.fn();

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
  },
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
  signOutAndClearLocalState,
} from "@/lib/auth-local-state";

describe("auth-local-state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue(undefined as never);
    mockGetSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    } as never);
  });

  afterEach(() => {
    jest.resetModules();
    jest.useRealTimers();
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

  it("validates cached sessions against Better Auth's durable session", async () => {
    const result = await reconcileAuthSession({
      hasClientSession: true,
      reason: "session-mismatch",
    });

    expect(result).toEqual({ status: "authenticated" });
    expect(mockGetSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
    });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("discards stale client artifacts without signing out", async () => {
    mockGetSession.mockResolvedValue({
      data: null,
      error: null,
    } as never);

    const result = await reconcileAuthSession({
      hasClientSession: true,
      reason: "session-mismatch",
    });

    expect(result).toEqual({ status: "recovered" });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockClearAuthPasswords).toHaveBeenCalledTimes(1);
    expect(mockClearEncPasswordCookie).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when validation returns an error", async () => {
    mockGetSession.mockResolvedValue({
      data: null,
      error: { message: "network" },
    } as never);

    const result = await reconcileAuthSession({ hasClientSession: true });

    expect(result).toEqual({ status: "unavailable" });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockClearAuthPasswords).not.toHaveBeenCalled();
  });

  it("keeps the session when validation cannot be reached", async () => {
    mockGetSession.mockRejectedValue(new Error("network") as never);

    const result = await reconcileAuthSession({ hasClientSession: true });

    expect(result).toEqual({ status: "unavailable" });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockClearAuthPasswords).not.toHaveBeenCalled();
  });

  it("signs out and clears local state even when server sign-out fails", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("offline") as never);

    await signOutAndClearLocalState();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockClearEncPasswordCookie).toHaveBeenCalledTimes(1);
  });

  it("clearOrphanedClientAuthArtifacts only clears orphaned encryption state", () => {
    clearOrphanedClientAuthArtifacts();

    expect(mockClearOrphanedEncPasswordCookie).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
