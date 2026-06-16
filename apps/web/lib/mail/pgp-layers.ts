export const PGP_MESSAGE_BEGIN = "-----BEGIN PGP MESSAGE-----";
export const PGP_MESSAGE_END = "-----END PGP MESSAGE-----";

export const MAX_PGP_DECRYPT_LAYERS = 4;

export type PgpSignatureVerificationState =
  | "not_signed"
  | "unverified"
  | "verified"
  | "failed";

export function containsArmoredPgpMessage(value: string | null | undefined): boolean {
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
