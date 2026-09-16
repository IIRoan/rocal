/**
 * Backend log sanitization policy — **single source of truth**.
 *
 * Key lists live in `logging.policy.mjs`; placeholders and PII patterns in `calendar-core/report-redaction`.
 *
 * When adding new log context fields that may contain user data, update
 * `logging.policy.mjs` first, then use helpers from `lib/log-sanitization.ts`.
 */

import {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
  LOG_SAFE_VALUE_CALLEES,
  LOG_URL_FIELD_KEYS,
} from "./logging.policy.mjs";

export {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
  LOG_SAFE_VALUE_CALLEES,
  LOG_URL_FIELD_KEYS,
};

export {
  LOG_OMITTED_PLACEHOLDER,
  LOG_REDACTED_BEARER_PLACEHOLDER,
  LOG_REDACTED_EMAIL_PLACEHOLDER,
  LOG_REDACTED_QUERY_PLACEHOLDER,
  LOG_REDACTED_URL_PLACEHOLDER,
  LOG_PII_TEXT_PATTERNS,
} from "@workspace/calendar-core/report-redaction";

export type LogOmitFieldKey = (typeof LOG_OMIT_FIELD_KEYS)[number];
export type LogHashFieldKey = (typeof LOG_HASH_FIELD_KEYS)[number];
export type LogUrlFieldKey = (typeof LOG_URL_FIELD_KEYS)[number];

/** Length of the hex prefix returned by `logRef()`. */
export const LOG_REF_HASH_LENGTH = 12;

/**
 * Safe structured error payload for logs — no stack traces, no nested payloads.
 */
export type SafeLogErrorDetails = {
  errorName?: string;
  message: string;
};

/**
 * Rules every backend logger call should follow.
 * Documented here so agents and humans share one reference.
 */
export type LogSanitizationPolicy = {
  /** Never log raw Error objects, stacks, or upstream response bodies. */
  neverLog: readonly string[];
  /** Hash or omit — see {@link LOG_OMIT_FIELD_KEYS} and {@link LOG_HASH_FIELD_KEYS}. */
  structuredFields: {
    omit: readonly LogOmitFieldKey[];
    hash: readonly LogHashFieldKey[];
  };
  /** Use `errorLogDetails()`, `sanitizeLogContext()`, `logRef()`, `redactPII()`. */
  helpers: readonly string[];
  /** Correlate user reports with logs via `requestId` / `x-request-id`. */
  requestCorrelation: readonly string[];
};

export const LOG_SANITIZATION_POLICY = {
  neverLog: [
    "stack traces",
    "raw Error objects (use errorLogDetails)",
    "mail/JMAP/HTML/ICS bodies",
    "passwords, tokens, invite URLs, vault ciphertext",
    "Prisma query literals when PRISMA_LOG_ALL_QUERIES is enabled in shared envs",
  ],
  structuredFields: {
    omit: LOG_OMIT_FIELD_KEYS,
    hash: LOG_HASH_FIELD_KEYS,
  },
  helpers: [
    "logRef",
    "redactPII",
    "errorLogDetails",
    "sanitizeLogContext",
    "sanitizeRequestUrl",
  ],
  requestCorrelation: ["requestId", "x-request-id"],
} as const satisfies LogSanitizationPolicy;
