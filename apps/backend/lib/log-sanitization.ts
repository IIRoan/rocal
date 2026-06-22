import { createHash } from "node:crypto";
import {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
  LOG_OMITTED_PLACEHOLDER,
  LOG_PII_TEXT_PATTERNS,
  LOG_REDACTED_BEARER_PLACEHOLDER,
  LOG_REDACTED_EMAIL_PLACEHOLDER,
  LOG_REDACTED_QUERY_PLACEHOLDER,
  LOG_REDACTED_URL_PLACEHOLDER,
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

const OMIT_LOG_KEYS = new Set<string>(LOG_OMIT_FIELD_KEYS);
const HASH_LOG_KEYS = new Set<string>(LOG_HASH_FIELD_KEYS);

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

/**
 * Redact common PII patterns from free-form log text.
 */
export function redactPII(text: string): string {
  return text
    .replace(LOG_PII_TEXT_PATTERNS.email, LOG_REDACTED_EMAIL_PLACEHOLDER)
    .replace(LOG_PII_TEXT_PATTERNS.bearer, LOG_REDACTED_BEARER_PLACEHOLDER)
    .replace(LOG_PII_TEXT_PATTERNS.url, LOG_REDACTED_URL_PLACEHOLDER);
}

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
 * Strip query strings from request URLs before logging.
 */
export function sanitizeRequestUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.search) {
      parsed.search = LOG_REDACTED_QUERY_PLACEHOLDER;
    }
    return parsed.toString();
  } catch {
    return redactPII(url);
  }
}

function sanitizeLogValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (OMIT_LOG_KEYS.has(key)) {
    return LOG_OMITTED_PLACEHOLDER;
  }

  if (HASH_LOG_KEYS.has(key) && typeof value === "string") {
    return logRef(value);
  }

  if (typeof value === "string") {
    return redactPII(value);
  }

  if (value instanceof Error) {
    return errorLogDetails(value);
  }

  if (Array.isArray(value)) {
    return {
      count: value.length,
      sample: value.length > 0 ? sanitizeLogValue(key, value[0]) : undefined,
    };
  }

  if (typeof value === "object") {
    return sanitizeLogContext(value as Record<string, unknown>);
  }

  return value;
}

/**
 * Sanitize a structured log context object before writing to logs.
 */
export function sanitizeLogContext(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    sanitized[key] = sanitizeLogValue(key, value);
  }

  return sanitized;
}
