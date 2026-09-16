/** Single source of truth for log/report redaction keys; plain ESM so ESLint can load it. */

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
