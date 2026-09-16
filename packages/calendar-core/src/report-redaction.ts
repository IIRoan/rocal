/**
 * Platform-agnostic redaction for logs and error reports (backend, web, native).
 *
 * Key lists come from `redaction-policy.js` (also consumed by the backend
 * safe-logging ESLint rules). No Node or DOM APIs so it runs in Bun, the
 * browser, the Next.js edge runtime, and Hermes.
 */
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

/**
 * Free-form text patterns redacted by `redactPII()`.
 * Order matters: bearer tokens before URLs avoids partial leaks.
 */
export const LOG_PII_TEXT_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  bearer: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  url: /https?:\/\/[^\s"'<>]+/gi,
} as const;

export type RedactionOptions = {
  /**
   * Stable one-way hash for identifier keys (`LOG_HASH_FIELD_KEYS`). When
   * omitted (clients without a sync hash), those values are dropped instead.
   */
  hashValue?: (value: string) => string;
};

type UnknownRecord = Record<string, unknown>;

const OMIT_KEYS = new Set(LOG_OMIT_FIELD_KEYS.map((key) => key.toLowerCase()));
const HASH_KEYS = new Set(LOG_HASH_FIELD_KEYS.map((key) => key.toLowerCase()));
const MAX_CONTEXT_DEPTH = 6;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Redact emails, bearer tokens and URLs from free-form text. */
export function redactPII(text: string): string {
  return text
    .replace(LOG_PII_TEXT_PATTERNS.email, LOG_REDACTED_EMAIL_PLACEHOLDER)
    .replace(LOG_PII_TEXT_PATTERNS.bearer, LOG_REDACTED_BEARER_PLACEHOLDER)
    .replace(LOG_PII_TEXT_PATTERNS.url, LOG_REDACTED_URL_PLACEHOLDER);
}

/** Strip query strings from absolute or relative request URLs. */
export function sanitizeRequestUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.search) {
      parsed.search = LOG_REDACTED_QUERY_PLACEHOLDER;
    }
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

/**
 * Sanitize a structured context object: omit content/secret keys, hash (or
 * drop) identifier keys, redact PII from strings, summarize arrays.
 */
export function sanitizeContext(
  context: UnknownRecord,
  options: RedactionOptions = {},
): UnknownRecord {
  return sanitizeContextAtDepth(context, options, 0);
}

/** Path prefixes that mark the start of a project-relative frame path. */
const PROJECT_PATH_MARKERS = [
  "node_modules/",
  "apps/",
  "packages/",
  "src/",
  "dist/",
  "build/",
];

/**
 * Keep the part of a frame path that source maps are keyed by, drop the rest:
 * absolute prefixes can carry usernames or device ids.
 *
 * Bundle URLs (`https://app/_next/static/chunks/x.js`) are public and are what
 * Sentry/Errex match uploaded artifacts against, so they survive intact minus
 * any query string. Filesystem paths keep only the project-relative tail. A
 * path with no recognizable root falls back to the bare file name.
 */
function sanitizeFramePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? "";
  if (/^https?:\/\//i.test(withoutQuery)) {
    return withoutQuery;
  }
  const normalized = withoutQuery.replace(/\\/g, "/");
  for (const marker of PROJECT_PATH_MARKERS) {
    const index = normalized.lastIndexOf(marker);
    if (index !== -1) {
      return redactPII(normalized.slice(index));
    }
  }
  const segments = normalized.split("/");
  return redactPII(segments[segments.length - 1] ?? "");
}

function scrubStacktrace(stacktrace: unknown): UnknownRecord | undefined {
  if (!isRecord(stacktrace) || !Array.isArray(stacktrace.frames)) {
    return undefined;
  }

  // Drop source context lines and local variables: they can hold user content.
  const frames = stacktrace.frames.filter(isRecord).map((frame) => {
    const scrubbed: UnknownRecord = {};
    if (typeof frame.filename === "string") {
      scrubbed.filename = sanitizeFramePath(frame.filename);
    }
    if (typeof frame.abs_path === "string") {
      scrubbed.abs_path = sanitizeFramePath(frame.abs_path);
    }
    if (typeof frame.function === "string") {
      scrubbed.function = redactPII(frame.function);
    }
    for (const field of ["lineno", "colno", "in_app", "platform"] as const) {
      if (frame[field] !== undefined) {
        scrubbed[field] = frame[field];
      }
    }
    return scrubbed;
  });

  return { frames };
}

function scrubException(exception: unknown): UnknownRecord | undefined {
  if (!isRecord(exception) || !Array.isArray(exception.values)) {
    return undefined;
  }

  return {
    values: exception.values.filter(isRecord).map((value) => {
      const scrubbed: UnknownRecord = {};
      if (typeof value.type === "string") {
        scrubbed.type = value.type;
      }
      if (typeof value.value === "string") {
        scrubbed.value = redactPII(value.value);
      }
      const stacktrace = scrubStacktrace(value.stacktrace);
      if (stacktrace) {
        scrubbed.stacktrace = stacktrace;
      }
      if (isRecord(value.mechanism)) {
        scrubbed.mechanism = {
          type: value.mechanism.type,
          handled: value.mechanism.handled,
        };
      }
      return scrubbed;
    }),
  };
}

function scrubMessage(message: unknown): unknown {
  if (typeof message === "string") {
    return redactPII(message);
  }
  if (!isRecord(message)) {
    return undefined;
  }
  const scrubbed: UnknownRecord = {};
  if (typeof message.formatted === "string") {
    scrubbed.formatted = redactPII(message.formatted);
  }
  if (typeof message.message === "string") {
    scrubbed.message = redactPII(message.message);
  }
  return scrubbed;
}

function scrubRequest(request: unknown): UnknownRecord | undefined {
  if (!isRecord(request)) {
    return undefined;
  }
  // Headers, cookies, body, query string and env (client IP) are never needed.
  const scrubbed: UnknownRecord = {};
  if (typeof request.method === "string") {
    scrubbed.method = request.method;
  }
  if (typeof request.url === "string") {
    scrubbed.url = sanitizeRequestUrl(request.url);
  }
  return scrubbed;
}

function sanitizeRecordField(
  value: unknown,
  options: RedactionOptions,
): UnknownRecord | undefined {
  return isRecord(value) ? sanitizeContext(value, options) : undefined;
}

function setOrDelete(target: UnknownRecord, key: string, value: unknown) {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
}

const HTTP_BREADCRUMB_CATEGORIES = new Set(["fetch", "xhr", "http"]);

/**
 * Scrub a Sentry-compatible breadcrumb. Console breadcrumbs are dropped (they
 * echo arbitrary log arguments); UI breadcrumbs lose their DOM-derived message.
 */
export function scrubBreadcrumb<T extends object>(
  breadcrumb: T,
  options: RedactionOptions = {},
): T | null {
  const source = breadcrumb as UnknownRecord;
  const category = typeof source.category === "string" ? source.category : "";
  if (category === "console" || category.startsWith("console.")) {
    return null;
  }

  const scrubbed: UnknownRecord = { ...source };

  if (category.startsWith("ui.")) {
    delete scrubbed.message;
  } else {
    setOrDelete(scrubbed, "message", scrubMessage(source.message));
  }

  const data = source.data;
  if (isRecord(data)) {
    if (category === "navigation") {
      scrubbed.data = {
        from: typeof data.from === "string" ? sanitizeRequestUrl(data.from) : undefined,
        to: typeof data.to === "string" ? sanitizeRequestUrl(data.to) : undefined,
      };
    } else if (HTTP_BREADCRUMB_CATEGORIES.has(category)) {
      const { url, ...rest } = data;
      const sanitized = sanitizeContext(rest, options);
      if (typeof url === "string") {
        sanitized.url = sanitizeRequestUrl(url);
      }
      scrubbed.data = sanitized;
    } else {
      scrubbed.data = sanitizeContext(data, options);
    }
  } else if (data !== undefined) {
    delete scrubbed.data;
  }

  return scrubbed as T;
}

/**
 * Scrub a Sentry-compatible event before it leaves the process/device:
 * exception messages and stack frames, message/logentry, request, user,
 * extras, contexts, tags and breadcrumbs.
 */
export function scrubErrorEvent<T extends object>(
  event: T,
  options: RedactionOptions = {},
): T {
  const source = event as UnknownRecord;
  const scrubbed: UnknownRecord = { ...source };

  // No user identity in reports; correlate with requestId instead.
  delete scrubbed.user;

  if ("message" in source) {
    setOrDelete(scrubbed, "message", scrubMessage(source.message));
  }
  if ("logentry" in source) {
    setOrDelete(scrubbed, "logentry", scrubMessage(source.logentry));
  }
  if ("exception" in source) {
    setOrDelete(scrubbed, "exception", scrubException(source.exception));
  }
  if ("stacktrace" in source) {
    setOrDelete(scrubbed, "stacktrace", scrubStacktrace(source.stacktrace));
  }
  if ("request" in source) {
    setOrDelete(scrubbed, "request", scrubRequest(source.request));
  }
  if (typeof source.transaction === "string") {
    scrubbed.transaction = sanitizeRequestUrl(source.transaction);
  }
  for (const field of ["extra", "tags"] as const) {
    if (field in source) {
      setOrDelete(scrubbed, field, sanitizeRecordField(source[field], options));
    }
  }
  if (isRecord(source.contexts)) {
    const contexts: UnknownRecord = {};
    for (const [name, value] of Object.entries(source.contexts)) {
      contexts[name] = isRecord(value)
        ? sanitizeContext(value, options)
        : LOG_OMITTED_PLACEHOLDER;
    }
    scrubbed.contexts = contexts;
  }
  if (Array.isArray(source.breadcrumbs)) {
    scrubbed.breadcrumbs = source.breadcrumbs
      .filter(isRecord)
      .map((breadcrumb) => scrubBreadcrumb(breadcrumb, options))
      .filter((breadcrumb) => breadcrumb !== null);
  }

  return scrubbed as T;
}
