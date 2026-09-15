import { createHash } from "node:crypto";
import {
  redactPII,
  sanitizeContext,
  sanitizeRequestUrl,
} from "@workspace/calendar-core/report-redaction";
import {
  LOG_REF_HASH_LENGTH,
  type SafeLogErrorDetails,
} from "../contracts/logging.contract";
import { errorString } from "./error-utils";

export type { SafeLogErrorDetails } from "../contracts/logging.contract";
export {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
  LOG_SANITIZATION_POLICY,
} from "../contracts/logging.contract";

/** Redact common PII patterns (emails, bearer tokens, URLs) from free-form text. */
export { redactPII };

/** Strip query strings from request URLs before logging. */
export { sanitizeRequestUrl };

/**
 * Short stable identifier for correlating logs without storing raw PII.
 */
export function logRef(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "empty";
  }

  return createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, LOG_REF_HASH_LENGTH);
}

/** Backend redaction hashes identifier keys with {@link logRef}. */
export const BACKEND_REDACTION_OPTIONS = { hashValue: logRef } as const;

/**
 * Safe error fields for structured logging — no stacks, no nested user payloads.
 */
export function errorLogDetails(error: unknown): SafeLogErrorDetails {
  return {
    errorName: error instanceof Error ? error.name : undefined,
    message: redactPII(errorString(error)),
  };
}

/**
 * Sanitize a structured log context object before writing to logs.
 */
export function sanitizeLogContext(
  context: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeContext(context, BACKEND_REDACTION_OPTIONS);
}
