import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockChangePassword = jest.fn<
  (input: { currentPassword: string; newPassword: string; email: string }) => Promise<{
    error?: { message?: string } | null;
  }>
>();
const mockStoreEnvelope = jest.fn<(userId: string, password: string) => Promise<boolean>>();
const mockSetCookie = jest.fn<(password: string) => Promise<void>>();

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    changePassword: (input: { currentPassword: string; newPassword: string; email: string }) =>
      mockChangePassword(input),
  },
  signOut: jest.fn(),
}));
jest.mock("@/lib/e2ee-bootstrap", () => ({
  storePasswordEnvelopeForActiveSession: (userId: string, password: string) =>
    mockStoreEnvelope(userId, password),
}));
jest.mock("@/lib/e2ee-password-reset", () => ({
  resetEncryptionPasswordForActiveSession: jest.fn(),
}));
jest.mock("@/lib/enc-password-cookie", () => ({
  setEncPasswordCookie: (password: string) => mockSetCookie(password),
}));
jest.mock("@/lib/calendar-api-service", () => ({ calendarApiService: {} }));
jest.mock("@workspace/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { persistPasswordChange } from "@/components/command-palette/command-palette-actions";

describe("persistPasswordChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreEnvelope.mockResolvedValue(true);
    mockSetCookie.mockResolvedValue(undefined);
  });

  it("re-wraps the encryption envelope with the new sign-in password", async () => {
    mockChangePassword.mockResolvedValue({ error: null });

    await expect(
      persistPasswordChange({
        sessionUserId: "user-1",
        email: "person@solace.test",
        currentPassword: "old-pw",
        newPassword: "new-pw",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: "old-pw",
      newPassword: "new-pw",
      email: "person@solace.test",
    });
    expect(mockStoreEnvelope).toHaveBeenCalledWith("user-1", "new-pw");
    expect(mockSetCookie).toHaveBeenCalledWith("new-pw");
  });

  it("leaves the envelope alone when the server refuses the change", async () => {
    mockChangePassword.mockResolvedValue({ error: { message: "Invalid password" } });

    const result = await persistPasswordChange({
      sessionUserId: "user-1",
      email: "person@solace.test",
      currentPassword: "wrong",
      newPassword: "new-pw",
    });

    expect(result.ok).toBe(false);
    expect(mockStoreEnvelope).not.toHaveBeenCalled();
    expect(mockSetCookie).not.toHaveBeenCalled();
  });
});
