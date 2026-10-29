import { normalizeParticipantEmail } from "./validation";

/** Max emails accepted in one authenticated profile lookup. */
export const SOLACE_PROFILE_LOOKUP_MAX_EMAILS = 50;

/** Square sizes the API stores for each uploaded picture; the largest is also the upload size. */
export const SOLACE_AVATAR_VARIANT_SIZES = [32, 64, 128, 256, 512] as const;

export type SolaceAvatarVariantSize = (typeof SOLACE_AVATAR_VARIANT_SIZES)[number];

/** Edge length clients crop and scale uploaded profile pictures to. */
export const SOLACE_AVATAR_UPLOAD_SIZE_PX = 512;

/** Largest encoded crop the API accepts for an uploaded profile picture. */
export const SOLACE_AVATAR_UPLOAD_MAX_BYTES = 512 * 1024;

/** Smallest stored variant that still looks sharp at `pixels` physical pixels. */
export function solaceAvatarVariantSize(pixels: number): SolaceAvatarVariantSize {
  return (
    SOLACE_AVATAR_VARIANT_SIZES.find((size) => size >= pixels) ??
    SOLACE_AVATAR_UPLOAD_SIZE_PX
  );
}

/** Opaque id of an uploaded profile picture (128 random bits, base64url). */
export const SOLACE_AVATAR_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Avatar lookup cache per email, invalidated for the signed-in user when their picture changes. */
export const solaceProfileImageQueryKey = (email: string | null | undefined) =>
  ["solace-profile-image", normalizeParticipantEmail(email)] as const;

const SOLACE_UPLOADED_AVATAR_PATH_PREFIX = "/api/profiles/avatars/";

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

export interface UploadProfileAvatarRequest {
  /** Base64 square JPEG/PNG/WebP of just the chosen crop; the API re-encodes it into every variant. */
  image: string;
}

export interface ProfileAvatarResponse {
  /** API-relative avatar path, or null once the picture is removed. */
  image: string | null;
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

/** Opaque-id path for a picture uploaded to Solace, so no email ends up in the URL. */
export function buildSolaceUploadedAvatarPath(avatarId: string): string {
  return `${SOLACE_UPLOADED_AVATAR_PATH_PREFIX}${avatarId}`;
}

export function isSolaceUploadedAvatarPath(
  value: string | null | undefined,
): boolean {
  return Boolean(value?.startsWith(SOLACE_UPLOADED_AVATAR_PATH_PREFIX));
}

/** Resolve a profile avatar path returned by the API to an absolute URL, sized for `pixels` when given. */
export function resolveSolaceProfileAvatarUrl(
  pathOrUrl: string | null | undefined,
  apiBaseUrl: string,
  pixels?: number,
): string | null {
  if (!pathOrUrl) {
    return null;
  }

  // Only Solace-served pictures load, so viewing a profile never contacts another host.
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return null;
  }

  const base = apiBaseUrl.replace(/\/+$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  if (!pixels || !isSolaceProfileAvatarUrl(path) || path.includes("size=")) {
    return `${base}${path}`;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${base}${path}${separator}size=${solaceAvatarVariantSize(pixels)}`;
}

export function isSolaceProfileAvatarUrl(
  value: string | null | undefined,
): boolean {
  return Boolean(value?.includes("/api/profiles/avatar"));
}
