/**
 * Shared error-classification helpers for retry logic in notification services.
 *
 * All checks operate on the lower-cased error message so callers don't need to
 * normalise the string first.
 */

const TRANSIENT_NETWORK_ERRORS = [
  "network",
  "timeout",
  "connection",
  "temporary",
  "rate limit",
  "service unavailable",
  "internal server error",
  "bad gateway",
  "gateway timeout",
  "econnreset",
  "enotfound",
  "etimedout",
] as const;

const PERMANENT_ERRORS = [
  "invalid email",
  "authentication failed",
  "unauthorized",
  "forbidden",
  "not found",
  "bad request",
  "validation",
  "malformed",
] as const;

const DATABASE_RETRYABLE_MESSAGES = [
  "connection",
  "timeout",
  "deadlock",
  "lock",
  "busy",
  "network",
  "econnreset",
  "enotfound",
  "etimedout",
  "server has gone away",
  "lost connection",
  "connection refused",
  "too many connections",
  "connection pool",
  "transaction",
] as const;

const DATABASE_RETRYABLE_CODES = [
  "P1001", // Can't reach database server
  "P1002", // Database server timeout
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a new connection
  "P2034", // Transaction failed due to a write conflict
  "40001", // Serialization failure
  "40P01", // Deadlock detected
  "53300", // Too many connections
  "08000", // Connection exception
  "08003", // Connection does not exist
  "08006", // Connection failure
] as const;

const UPDATE_RETRYABLE_MESSAGES = [
  "deadlock",
  "lock",
  "conflict",
  "concurrent",
  "serialization",
  "unique constraint",
  "foreign key constraint",
  "transaction",
  "could not serialize",
  "update conflict",
  "version mismatch",
] as const;

const UPDATE_RETRYABLE_CODES = [
  "P2002", // Unique constraint failed
  "P2003", // Foreign key constraint failed
  "P2034", // Transaction failed due to a write conflict
  "40001", // Serialization failure
  "40P01", // Deadlock detected
  "23505", // Unique violation
  "23503", // Foreign key violation
] as const;

type CodedError = Error & { code?: string };

function matchesAny(msg: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => msg.includes(p));
}

/**
 * Returns true for transient/retriable HTTP / network errors.
 * Returns false for permanent errors and non-Error values.
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  if (matchesAny(msg, PERMANENT_ERRORS)) return false;
  if (matchesAny(msg, TRANSIENT_NETWORK_ERRORS)) return true;
  // Unknown errors: default to retryable (conservative)
  return true;
}

/**
 * Returns true for transient Prisma / PostgreSQL database errors.
 * Returns false for permanent errors and non-Error values.
 */
export function isRetryableDatabaseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const code = (error as CodedError).code;
  if (code && (DATABASE_RETRYABLE_CODES as readonly string[]).includes(code))
    return true;
  return matchesAny(msg, DATABASE_RETRYABLE_MESSAGES);
}

/**
 * Returns true for concurrent-update errors (deadlock, version mismatch, etc.).
 * Falls back to {@link isRetryableDatabaseError} for generic DB errors.
 */
export function isRetryableUpdateError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const code = (error as CodedError).code;
  if (code && (UPDATE_RETRYABLE_CODES as readonly string[]).includes(code))
    return true;
  if (matchesAny(msg, UPDATE_RETRYABLE_MESSAGES)) return true;
  return isRetryableDatabaseError(error);
}
