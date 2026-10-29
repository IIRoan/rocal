import { normalizeParticipantEmail } from "@workspace/calendar-core";

// The retired API keeps the external-picture rules calendar-core dropped with upload-only pictures.
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

/** Only public HTTPS URLs; credentials and private hosts are dropped so avatars cannot beacon internal addresses. */
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

export function buildSolaceProfileAvatarPath(email: string): string | null {
  const normalized = normalizeParticipantEmail(email);
  if (!normalized) {
    return null;
  }

  return `/api/profiles/avatar?email=${encodeURIComponent(normalized)}`;
}
