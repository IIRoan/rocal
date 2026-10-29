import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  email: string;
  passwordEnvelope?: { kdfSalt: string };
};

const mockChangePassword = jest.fn<
  (input: ChangePasswordInput) => Promise<{
    error?: { message?: string } | null;
  }>
>();
const mockCreateEnvelope = jest.fn<
  (accountKey: unknown, blindIndexKey: unknown, password: string) => Promise<{ kdfSalt: string }>
>();
const mockGetSession = jest.fn<() => unknown>();
const mockRememberSalt = jest.fn<
  (userId: string, deviceId: string, salt: string | null) => Promise<void>
>();
const mockSetCookie = jest.fn<(password: string) => Promise<void>>();

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    changePassword: (input: ChangePasswordInput) => mockChangePassword(input),
  },
  signOut: jest.fn(),
}));
jest.mock("@/lib/e2ee-bootstrap", () => ({
  storePasswordEnvelopeForActiveSession: jest.fn(),
}));
jest.mock("@/lib/e2ee-crypto", () => ({
  createPasswordEnvelope: (accountKey: unknown, blindIndexKey: unknown, password: string) =>
    mockCreateEnvelope(accountKey, blindIndexKey, password),
}));
jest.mock("@/lib/e2ee-session", () => ({
  getActiveE2eeSession: () => mockGetSession(),
}));
jest.mock("@/lib/e2ee-storage", () => ({
  rememberStoredDeviceEnvelopeSalt: (userId: string, deviceId: string, salt: string | null) =>
    mockRememberSalt(userId, deviceId, salt),
}));
jest.mock("@/lib/enc-password-cookie", () => ({
  setEncPasswordCookie: (password: string) => mockSetCookie(password),
}));
jest.mock("@/lib/calendar-api-service", () => ({ calendarApiService: {} }));
jest.mock("@workspace/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { persistPasswordChange } from "@/components/command-palette/command-palette-actions";

const input = {
  sessionUserId: "user-1",
  email: "person@solace.test",
  currentPassword: "old-pw",
  newPassword: "new-pw",
};

describe("persistPasswordChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockReturnValue({
      userId: "user-1",
      deviceId: "device-1",
      accountKey: "account-key",
      blindIndexKey: "search-key",
    });
    mockCreateEnvelope.mockResolvedValue({ kdfSalt: "new-salt" });
    mockRememberSalt.mockResolvedValue(undefined);
    mockSetCookie.mockResolvedValue(undefined);
  });

  it("sends the envelope for the new password with the change in one request", async () => {
    mockChangePassword.mockResolvedValue({ error: null });

    await expect(persistPasswordChange(input)).resolves.toEqual({ ok: true });

    expect(mockCreateEnvelope).toHaveBeenCalledWith(
      "account-key",
      "search-key",
      "new-pw",
    );
    expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: "old-pw",
      newPassword: "new-pw",
      email: "person@solace.test",
      passwordEnvelope: { kdfSalt: "new-salt" },
    });
    expect(mockRememberSalt).toHaveBeenCalledWith("user-1", "device-1", "new-salt");
    expect(mockSetCookie).toHaveBeenCalledWith("new-pw");
  });

  it("keeps the local state when the server refuses the change", async () => {
    mockChangePassword.mockResolvedValue({ error: { message: "Invalid password" } });

    const result = await persistPasswordChange({ ...input, currentPassword: "wrong" });

    expect(result.ok).toBe(false);
    expect(mockRememberSalt).not.toHaveBeenCalled();
    expect(mockSetCookie).not.toHaveBeenCalled();
  });

  it("refuses to change the password without open encryption keys", async () => {
    mockGetSession.mockReturnValue(null);

    const result = await persistPasswordChange(input);

    expect(result.ok).toBe(false);
    expect(mockChangePassword).not.toHaveBeenCalled();
  });
});
