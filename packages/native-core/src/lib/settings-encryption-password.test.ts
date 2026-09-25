import {
  canResetEncryptionPassword,
  getEncryptionPasswordValidationError,
} from "./settings-encryption-password";

describe("encryption password settings", () => {
  it("is available for OAuth or passkey accounts", () => {
    expect(
      canResetEncryptionPassword({ hasOAuthAccount: true, passkeyCount: 0 }),
    ).toBe(true);
    expect(
      canResetEncryptionPassword({ hasOAuthAccount: false, passkeyCount: 1 }),
    ).toBe(true);
    expect(
      canResetEncryptionPassword({ hasOAuthAccount: false, passkeyCount: 0 }),
    ).toBe(false);
  });

  it("requires a confirmed password of at least 8 characters", () => {
    expect(
      getEncryptionPasswordValidationError({
        newPassword: "short",
        confirmPassword: "short",
      }),
    ).toMatch(/8 characters/);
    expect(
      getEncryptionPasswordValidationError({
        newPassword: "long-enough",
        confirmPassword: "different",
      }),
    ).toMatch(/must match/);
    expect(
      getEncryptionPasswordValidationError({
        newPassword: "long-enough",
        confirmPassword: "long-enough",
      }),
    ).toBeNull();
  });
});
