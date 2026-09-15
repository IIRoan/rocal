/**
 * Machine-readable log sanitization policy for ESLint and the TypeScript contract.
 * Omit/hash key lists are shared with the web and native error reporters, so they
 * live in `packages/calendar-core/src/redaction-policy.js` — add new sensitive
 * keys there. `logging.contract.ts` re-exports everything as the documented API.
 */

export {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
} from "../../../packages/calendar-core/src/redaction-policy.js";

/**
 * Callee names treated as safe wrappers for sensitive log field values.
 * @type {readonly string[]}
 */
export const LOG_SAFE_VALUE_CALLEES = Object.freeze([
  "logRef",
  "redactPII",
  "errorLogDetails",
  "sanitizeLogContext",
  "sanitizeRequestUrl",
  "summarizeBearerToken",
  "summarizeUpstreamErrorBody",
]);

/** @type {readonly string[]} */
export const LOG_URL_FIELD_KEYS = Object.freeze([
  "url",
  "upstreamUrl",
  "requestUrl",
]);
