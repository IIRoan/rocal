export function canResetEncryptionPassword(input: {
  hasOAuthAccount: boolean;
  passkeyCount: number;
}): boolean {
  return input.hasOAuthAccount || input.passkeyCount > 0;
}

export function getEncryptionPasswordValidationError(input: {
  newPassword: string;
  confirmPassword: string;
}): string | null {
  const next = input.newPassword.trim();
  if (next.length < 8) {
    return "Use at least 8 characters for your encryption password.";
  }
  if (next !== input.confirmPassword) {
    return "New password and confirmation must match.";
  }
  return null;
}
