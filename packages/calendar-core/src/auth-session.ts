export const AUTH_SESSION_LIFETIME_SECONDS = 14 * 24 * 60 * 60;
export const AUTH_SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;
export const AUTH_SESSION_REFRESH_INTERVAL_SECONDS = 60 * 60;

export const SIGN_IN_UNREACHABLE_MESSAGE =
  "Solace can't be reached right now. Try again in a moment.";
export const SIGN_IN_REJECTED_MESSAGE =
  "Email or password is incorrect. Check both and try again.";

/** A gateway or network failure carries no message, and must not read as wrong credentials. */
export function getSignInErrorMessage(error: {
  message?: string | null;
  status?: number | null;
}): string {
  const message = error.message?.trim();
  if (message) return message;
  if (!error.status || error.status >= 500) return SIGN_IN_UNREACHABLE_MESSAGE;
  return SIGN_IN_REJECTED_MESSAGE;
}
