/** No Node or DOM APIs: this runs in Bun, the browser, the Next.js edge runtime, and Hermes. */
import {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
} from "./redaction-policy.js";

export { LOG_HASH_FIELD_KEYS, LOG_OMIT_FIELD_KEYS };

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

/** Order matters: bearer tokens before URLs avoids partial leaks. */
export const LOG_PII_TEXT_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /** encodeURIComponent emails appear in URL path params (mail key lookups take an email). */
  encodedEmail: /[a-zA-Z0-9._%+-]+%40[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  bearer: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  url: /https?:\/\/[^\s"'<>]+/gi,
} as const;

type RedactionOptions = {
  /** When omitted (clients without a sync hash), identifier values are dropped instead of hashed. */
  hashValue?: (value: string) => string;
};

type UnknownRecord = Record<string, unknown>;

const OMIT_KEYS = new Set(LOG_OMIT_FIELD_KEYS.map((key) => key.toLowerCase()));
const HASH_KEYS = new Set(LOG_HASH_FIELD_KEYS.map((key) => key.toLowerCase()));
const MAX_CONTEXT_DEPTH = 6;

/** Redact emails, bearer tokens and URLs from free-form text. */
export function redactPII(text: string): string {
  return text
    .replace(LOG_PII_TEXT_PATTERNS.email, LOG_REDACTED_EMAIL_PLACEHOLDER)
    .replace(
      LOG_PII_TEXT_PATTERNS.encodedEmail,
      LOG_REDACTED_EMAIL_PLACEHOLDER,
    )
    .replace(LOG_PII_TEXT_PATTERNS.bearer, LOG_REDACTED_BEARER_PLACEHOLDER)
    .replace(LOG_PII_TEXT_PATTERNS.url, LOG_REDACTED_URL_PLACEHOLDER);
}

/** Strip query strings and redact email path params from absolute or relative request URLs. */
export function sanitizeRequestUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.search) {
      parsed.search = LOG_REDACTED_QUERY_PLACEHOLDER;
    }
    // Path params can carry PII (mail key lookups take an email); redact before logging.
    parsed.pathname = parsed.pathname
      .replace(LOG_PII_TEXT_PATTERNS.email, LOG_REDACTED_EMAIL_PLACEHOLDER)
      .replace(
        LOG_PII_TEXT_PATTERNS.encodedEmail,
        LOG_REDACTED_EMAIL_PLACEHOLDER,
      );
    return parsed.toString();
  } catch {
    const queryStart = url.indexOf("?");
    const withoutQuery =
      queryStart === -1
        ? url
        : `${url.slice(0, queryStart)}${LOG_REDACTED_QUERY_PLACEHOLDER}`;
    return redactPII(withoutQuery);
  }
}

function sanitizeValue(
  key: string,
  value: unknown,
  options: RedactionOptions,
  depth: number,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const normalizedKey = key.toLowerCase();
  if (OMIT_KEYS.has(normalizedKey)) {
    return LOG_OMITTED_PLACEHOLDER;
  }

  if (HASH_KEYS.has(normalizedKey)) {
    return typeof value === "string" && options.hashValue
      ? options.hashValue(value)
      : LOG_OMITTED_PLACEHOLDER;
  }

  if (typeof value === "string") {
    return redactPII(value);
  }

  if (value instanceof Error) {
    return { errorName: value.name, message: redactPII(value.message) };
  }

  if (typeof value !== "object") {
    return value;
  }

  if (depth >= MAX_CONTEXT_DEPTH) {
    return LOG_OMITTED_PLACEHOLDER;
  }

  if (Array.isArray(value)) {
    return {
      count: value.length,
      sample:
        value.length > 0
          ? sanitizeValue(key, value[0], options, depth + 1)
          : undefined,
    };
  }

  return sanitizeContextAtDepth(value as UnknownRecord, options, depth + 1);
}

function sanitizeContextAtDepth(
  context: UnknownRecord,
  options: RedactionOptions,
  depth: number,
): UnknownRecord {
  const sanitized: UnknownRecord = {};
  for (const [key, value] of Object.entries(context)) {
    sanitized[key] = sanitizeValue(key, value, options, depth);
  }
  return sanitized;
}

export function sanitizeContext(
  context: UnknownRecord,
  options: RedactionOptions = {},
): UnknownRecord {
  return sanitizeContextAtDepth(context, options, 0);
}
