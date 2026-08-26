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
  "image",
  "token",
  "invite",
  "password",
  "secret",
  "encryptedVaultB64",
  "publicKeyArmored",
  "mime",
  "icsContent",
  "pushToken",
  "deviceToken",
  "apnsToken",
  "bodyValues",
  "displayTitle",
  "display_title",
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
  "emailId",
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
