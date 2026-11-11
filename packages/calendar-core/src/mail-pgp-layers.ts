import { fitsMailUtf8ByteLimit, MAX_MAIL_MIME_HEADER_BYTES } from "./mail-mime-limits";
export const PGP_MESSAGE_BEGIN = "-----BEGIN PGP MESSAGE-----";
export const PGP_MESSAGE_END = "-----END PGP MESSAGE-----";

export const MAX_PGP_DECRYPT_LAYERS = 4;

export type PgpSignatureVerificationState =
  "not_signed" | "unverified" | "verified" | "failed";

export function containsArmoredPgpMessage(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && value.includes(PGP_MESSAGE_BEGIN);
}

/** True when an armored block includes both BEGIN and END markers. */
export function isCompleteArmoredPgpMessage(
  value: string | null | undefined,
): boolean {
  return (
    containsArmoredPgpMessage(value) &&
    typeof value === "string" &&
    value.includes(PGP_MESSAGE_END)
  );
}

/** True when ciphertext appears to contain multiple armored PGP envelopes. */
export function isNestedArmoredPgpMessage(value: string): boolean {
  if (!containsArmoredPgpMessage(value)) {
    return false;
  }

  const firstEnd = value.indexOf(PGP_MESSAGE_END);
  if (firstEnd < 0) {
    return false;
  }

  const remainder = value.slice(firstEnd + PGP_MESSAGE_END.length);
  return containsArmoredPgpMessage(remainder);
}

export async function resolveLayerSignatureVerificationState(input: {
  signatures: Array<{ verified: Promise<unknown> }> | undefined;
  hasVerificationKey: boolean;
}): Promise<PgpSignatureVerificationState> {
  if (!Array.isArray(input.signatures) || input.signatures.length === 0) {
    return "not_signed";
  }

  if (!input.hasVerificationKey) {
    await Promise.allSettled(
      input.signatures.map((signature) => signature.verified),
    );
    return "unverified";
  }

  try {
    await Promise.all(input.signatures.map((signature) => signature.verified));
    return "verified";
  } catch {
    return "failed";
  }
}

export function mergeSignatureVerificationState(
  current: PgpSignatureVerificationState,
  layer: PgpSignatureVerificationState,
): PgpSignatureVerificationState {
  if (current === "failed" || layer === "failed") {
    return "failed";
  }
  if (current === "verified" || layer === "verified") {
    return "verified";
  }
  if (current === "unverified" || layer === "unverified") {
    return "unverified";
  }
  return "not_signed";
}

export const MAX_PGP_DECRYPT_BYTES = 96 * 1024 * 1024;
export const MAX_PGP_ENVELOPE_BYTES = 128 * 1024 * 1024;

export function getPgpMimeEnvelopeContentType(
  plaintext: string,
): string | null {
  const prefix = plaintext.slice(0, MAX_MAIL_MIME_HEADER_BYTES + 4);
  const separator = /\r?\n\r?\n/.exec(prefix);
  if (!separator) return null;
  const lines = prefix
    .slice(0, separator.index)
    .replace(/\r?\n[ \t]+/g, " ")
    .split(/\r?\n/);
  const headers = lines.filter((line) => /^Content-Type:/i.test(line));
  const value =
    headers.length === 1
      ? headers[0]?.slice("Content-Type:".length).trim()
      : undefined;
  return value && /^multipart\/encrypted(?:\s*;|\s*$)/i.test(value)
    ? value
    : null;
}

export function resolveNestedPgpMimeCiphertext(input: {
  contentType: string;
  parts: { type: string; body: string }[];
}): string | null {
  if (!/^multipart\/encrypted(?:\s*;|\s*$)/i.test(input.contentType.trim()))
    return null;
  const [control, payload] = input.parts;
  if (
    input.parts.length !== 2 ||
    control?.type.toLowerCase() !== "application/pgp-encrypted" ||
    payload?.type.toLowerCase() !== "application/octet-stream" ||
    !/^Version:\s*1$/i.test(control.body.trim())
  ) {
    throw new Error("Encrypted MIME control parts are invalid.");
  }
  const armored = payload.body.trim();
  if (
    !armored.startsWith(PGP_MESSAGE_BEGIN) ||
    !armored.endsWith(PGP_MESSAGE_END)
  ) {
    throw new Error("Encrypted MIME ciphertext is invalid.");
  }
  return armored;
}

export async function decryptPgpMessageLayers(input: {
  armoredMessage: string;
  decryptLayer: (armoredMessage: string) => Promise<{
    plaintext: string;
    signatures?: { verified: Promise<unknown> }[];
    hasVerificationKey: boolean;
  }>;
  extractMimeCiphertext: (
    plaintext: string,
  ) => Promise<string | null> | string | null;
}) {
  let current = input.armoredMessage.trim();
  let signatureVerificationState: PgpSignatureVerificationState = "not_signed";
  const signatureVerificationLayers: PgpSignatureVerificationState[] = [];
  for (let layer = 0; layer < MAX_PGP_DECRYPT_LAYERS; layer += 1) {
    if (!fitsMailUtf8ByteLimit(current, MAX_PGP_ENVELOPE_BYTES)) {
      throw new Error("Encrypted message exceeds the decryption size limit.");
    }
    const decrypted = await input.decryptLayer(current);
    const plaintext = decrypted.plaintext;
    if (!plaintext)
      throw new Error("PGP decryption did not return any plaintext.");
    if (
      !fitsMailUtf8ByteLimit(plaintext, MAX_PGP_DECRYPT_BYTES)
    ) {
      throw new Error("Encrypted message exceeds the decryption size limit.");
    }
    const state = await resolveLayerSignatureVerificationState({
      signatures: decrypted.signatures,
      hasVerificationKey: decrypted.hasVerificationKey,
    });
    signatureVerificationLayers.push(state);
    signatureVerificationState = mergeSignatureVerificationState(
      signatureVerificationState,
      state,
    );
    const trimmed = plaintext.trim();
    const nested =
      trimmed.startsWith(PGP_MESSAGE_BEGIN) && trimmed.endsWith(PGP_MESSAGE_END)
        ? trimmed
        : await input.extractMimeCiphertext(plaintext);
    if (!nested) {
      return {
        plaintext,
        signatureVerificationState,
        signatureVerificationLayers,
        hasVerifiedSignature: signatureVerificationState === "verified",
      };
    }
    current = nested;
  }
  throw new Error("Encrypted message exceeds the decryption layer limit.");
}
