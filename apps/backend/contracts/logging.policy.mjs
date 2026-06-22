/**
 * Machine-readable log sanitization policy for ESLint and the TypeScript contract.
 * Keep arrays here — `logging.contract.ts` re-exports them as the documented API.
 */

/** @type {readonly string[]} */
export const LOG_OMIT_FIELD_KEYS = Object.freeze([
  "body",
  "content",
  "html",
  "text",
  "subject",
  "title",
  "message",
  "upstreamBody",
  "resetUrl",
  "signupUrl",
  "url",
  "token",
  "invite",
  "password",
  "secret",
  "encryptedVaultB64",
  "publicKeyArmored",
  "mime",
  "icsContent",
]);

/** @type {readonly string[]} */
export const LOG_HASH_FIELD_KEYS = Object.freeze([
  "email",
  "to",
  "from",
  "inviteeEmail",
  "requestedEmail",
  "existingEmail",
  "chosenEmail",
  "recipient",
  "displayName",
  "name",
  "inviterName",
  "attendeeName",
  "localPart",
]);

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
