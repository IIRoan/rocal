/**
 * Backend log sanitization policy — **single source of truth**.
 *
 * Field key lists live in `logging.policy.mjs` (shared with ESLint). This file
 * documents placeholders, types, and runtime policy metadata.
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

/** Placeholder written when a structured field is fully omitted. */
export const LOG_OMITTED_PLACEHOLDER = "[omitted]" as const;

/** Placeholder written when an email address is redacted from free-form text. */
export const LOG_REDACTED_EMAIL_PLACEHOLDER = "[email]" as const;

/** Placeholder written when a URL is redacted from free-form text. */
export const LOG_REDACTED_URL_PLACEHOLDER = "[url]" as const;

/** Placeholder written when a bearer token is redacted from free-form text. */
export const LOG_REDACTED_BEARER_PLACEHOLDER = "Bearer [redacted]" as const;

/** Placeholder written when a request URL query string is stripped. */
export const LOG_REDACTED_QUERY_PLACEHOLDER = "?[redacted]" as const;

export type LogOmitFieldKey = (typeof LOG_OMIT_FIELD_KEYS)[number];
export type LogHashFieldKey = (typeof LOG_HASH_FIELD_KEYS)[number];
export type LogUrlFieldKey = (typeof LOG_URL_FIELD_KEYS)[number];

/**
 * Free-form text patterns redacted by `redactPII()` before logging.
 * Order matters: bearer tokens before URLs avoids partial leaks.
 */
export const LOG_PII_TEXT_PATTERNS = {
  email:
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  bearer: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  url: /https?:\/\/[^\s"'<>]+/gi,
} as const;

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
