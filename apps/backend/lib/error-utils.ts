/**
 * Error string helpers shared by API errors and log sanitization.
 * Kept separate from `errors.ts` to avoid a circular import with log-sanitization.
 */

/** Human-readable message from an unknown error; uses `fallback` when not an Error. */
export function errorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return fallback;
}

/** Like {@link errorMessage} but falls back to `String(error)` for diagnostics. */
export function errorString(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
