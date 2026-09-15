/**
 * Sensitive structured-field keys — **single source of truth** for backend log
 * sanitization (`apps/backend/contracts/logging.policy.mjs` re-exports these
 * for the safe-logging ESLint rules) and for every error-report scrubber
 * (backend, web, native). Plain ESM so ESLint can load it without a TS loader;
 * types live in `redaction-policy.d.ts`.
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
  "authorization",
  "cookie",
  "cookies",
  "encryptedVaultB64",
  "publicKeyArmored",
  "mime",
  "icsContent",
  "pushToken",
  "deviceToken",
  "apnsToken",
  "bodyValues",
  // Rejected by the API but still sent by shipped native binaries.
  "displayTitle",
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
