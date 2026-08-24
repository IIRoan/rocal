import { normalizeParticipantEmail } from "./validation";

/** Max emails accepted in one authenticated profile lookup. */
export const SOLACE_PROFILE_LOOKUP_MAX_EMAILS = 50;

const MAX_PUBLIC_IMAGE_URL_LENGTH = 2048;

const BLOCKED_IMAGE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^\[::1\]$/,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\.google\.internal$/i,
];

export interface SolaceProfile {
  email: string;
  image: string;
}

export interface SolaceProfileLookupRequest {
  emails: string[];
}

export interface SolaceProfileLookupResponse {
  profiles: SolaceProfile[];
}

/**
 * Allow only publicly fetchable HTTPS image URLs.
 * Drops credentials, private/link-local hosts, and non-https schemes so
 * avatars cannot be used as tracking beacons against internal addresses.
 */
export function sanitizePublicImageUrl(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PUBLIC_IMAGE_URL_LENGTH) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  const hostname = url.hostname.trim();
  if (!hostname) {
    return null;
  }

  if (BLOCKED_IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return null;
  }

  const ipv6Host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    ipv6Host.includes(":") &&
    (ipv6Host.startsWith("fc") ||
      ipv6Host.startsWith("fd") ||
      ipv6Host.startsWith("fe80") ||
      ipv6Host === "::1")
  ) {
    return null;
  }

  return url.toString();
}

/** Deduplicate, normalize, and cap a client-supplied email list. */
export function normalizeSolaceProfileLookupEmails(
  emails: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of emails) {
    const email = normalizeParticipantEmail(raw);
    if (!email || seen.has(email) || !email.includes("@")) {
      continue;
    }

    seen.add(email);
    result.push(email);

    if (result.length >= SOLACE_PROFILE_LOOKUP_MAX_EMAILS) {
      break;
    }
  }

  return result;
}

/** Same-origin path clients use to display a profile picture through the API proxy. */
export function buildSolaceProfileAvatarPath(email: string): string | null {
  const normalized = normalizeParticipantEmail(email);
  if (!normalized) {
    return null;
  }

  return `/api/profiles/avatar?email=${encodeURIComponent(normalized)}`;
}

/** Resolve a profile avatar path returned by the API to an absolute URL. */
export function resolveSolaceProfileAvatarUrl(
  pathOrUrl: string | null | undefined,
  apiBaseUrl: string,
): string | null {
  if (!pathOrUrl) {
    return null;
  }

  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  const base = apiBaseUrl.replace(/\/+$/, "");
  return `${base}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function isSolaceProfileAvatarUrl(
  value: string | null | undefined,
): boolean {
  return Boolean(value?.includes("/api/profiles/avatar"));
}
