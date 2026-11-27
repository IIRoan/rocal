import { normalizeEmailAddress, parseRecipientString } from "./mail-addresses";
import {
  readMailMimeKeyParts,
  readMailMimeSignedParts,
  type MailMimeSignedParts,
} from "./mail-mime-parser";
import {
  mergeSignatureVerificationState,
  type PgpSignatureVerificationState,
} from "./mail-pgp-layers";

/** RFC 3156 micalg names of the RFC 9580 hash ids a signature may use; Ed25519 keys require SHA-512. */
const MICALG_BY_HASH_ID: Record<number, string> = { 8: "pgp-sha256", 9: "pgp-sha384", 10: "pgp-sha512" };
const PUBLIC_KEY_BEGIN = "-----BEGIN PGP PUBLIC KEY BLOCK-----";

type DetachedSignature = { packets: ArrayLike<{ hashAlgorithm: number | null }> };

type SignatureKey = {
  isPrivate(): boolean;
  verifyAllUsers(): Promise<{ userID: string; valid: boolean | null }[]>;
};

type MailPgpSigningProvider<PrivateKey, Message, Signature extends DetachedSignature> = {
  createMessage: (input: { binary: Uint8Array }) => Promise<Message>;
  sign: (input: {
    message: Message;
    signingKeys: PrivateKey;
    detached: true;
    format: "armored";
  }) => Promise<string>;
  readSignature: (input: { armoredSignature: string }) => Promise<Signature>;
};

type MailPgpVerificationProvider<Key extends SignatureKey, Message, Signature extends DetachedSignature> = {
  createMessage: (input: { binary: Uint8Array }) => Promise<Message>;
  readSignature: (input: { armoredSignature: string }) => Promise<Signature>;
  readKey: (input: { armoredKey: string }) => Promise<Key>;
  verify: (input: {
    message: Message;
    signature: Signature;
    verificationKeys: Key;
    format: "binary";
  }) => Promise<{ signatures: { verified: Promise<unknown> }[] }>;
};

/** A detached signature over exactly these bytes, with the vault key captured before any await, and the micalg naming its digest. */
export async function signMailDetached<PrivateKey, Message, Signature extends DetachedSignature>(
  input: { data: string },
  context: { signingKey: PrivateKey; isCurrent: () => boolean },
  provider: MailPgpSigningProvider<PrivateKey, Message, Signature>,
): Promise<{ armoredSignature: string; micalg: string }> {
  const assertCurrent = () => {
    if (!context.isCurrent()) throw new Error("Mail encryption session changed. Please try again.");
  };
  assertCurrent();
  const message = await provider.createMessage({ binary: new TextEncoder().encode(input.data) });
  assertCurrent();
  const armoredSignature = await provider.sign({
    message,
    signingKeys: context.signingKey,
    detached: true,
    format: "armored",
  });
  assertCurrent();
  const { packets } = await provider.readSignature({ armoredSignature });
  const micalg = packets.length === 1 ? MICALG_BY_HASH_ID[packets[0]?.hashAlgorithm ?? 0] : undefined;
  if (!micalg) throw new Error("Mail signature uses an unsupported digest.");
  return { armoredSignature, micalg };
}

function userIdEmail(userID: string): string {
  return parseRecipientString(userID).email.replace(/^<|>$/g, "");
}

/** The one public key the signed part carries, only when a self-certified user ID names the sender. */
async function readAttachedSenderKey<Key extends SignatureKey>(
  content: string,
  senderEmail: string,
  readKey: (input: { armoredKey: string }) => Promise<Key>,
): Promise<Key | null> {
  const keys = readMailMimeKeyParts(content);
  const armoredKey = keys.length === 1 ? keys[0] : undefined;
  if (!armoredKey?.startsWith(PUBLIC_KEY_BEGIN)) return null;
  const key = await readKey({ armoredKey });
  if (key.isPrivate()) return null;
  const sender = normalizeEmailAddress(parseRecipientString(senderEmail).email);
  const users = await key.verifyAllUsers();
  return users.some((user) => user.valid === true && userIdEmail(user.userID) === sender) ? key : null;
}

/** Checks a PGP/MIME signature against the sender's known key, else a key attached for the sender's address. */
export async function verifyMailMimeSignature<Key extends SignatureKey, Message, Signature extends DetachedSignature>(
  input: {
    signed: MailMimeSignedParts;
    senderEmail?: string | null;
    senderPublicKeyArmored?: string;
  },
  provider: MailPgpVerificationProvider<Key, Message, Signature>,
): Promise<PgpSignatureVerificationState> {
  const signature = await provider.readSignature({ armoredSignature: input.signed.armoredSignature }).catch(() => null);
  if (!signature || signature.packets.length !== 1) return "failed";
  const known = input.senderPublicKeyArmored;
  const key = known
    ? await provider.readKey({ armoredKey: known }).catch(() => null)
    : input.senderEmail
      ? await readAttachedSenderKey(input.signed.content, input.senderEmail, provider.readKey).catch(() => null)
      : null;
  if (!key) return "unverified";
  try {
    const message = await provider.createMessage({ binary: new TextEncoder().encode(input.signed.signedText) });
    const { signatures } = await provider.verify({ message, signature, verificationKeys: key, format: "binary" });
    if (signatures.length !== 1) return "failed";
    await signatures[0]?.verified;
    return known ? "verified" : "attached_key";
  } catch {
    return "failed";
  }
}

/** Decrypted mail that is an RFC 3156 signed entity is read from its signed part, with that signature merged into the state. */
export async function resolveSignedMailContent<Key extends SignatureKey, Message, Signature extends DetachedSignature>(
  input: {
    plaintext: string;
    signatureVerificationState: PgpSignatureVerificationState;
    senderEmail?: string | null;
    senderPublicKeyArmored?: string;
  },
  provider: MailPgpVerificationProvider<Key, Message, Signature>,
): Promise<{
  plaintext: string;
  signatureVerificationState: PgpSignatureVerificationState;
  hasVerifiedSignature: boolean;
}> {
  let signed: MailMimeSignedParts | null;
  let state: PgpSignatureVerificationState;
  try {
    signed = readMailMimeSignedParts(input.plaintext);
    state = signed ? await verifyMailMimeSignature({ ...input, signed }, provider) : "not_signed";
  } catch {
    signed = null;
    state = "failed";
  }
  const signatureVerificationState = mergeSignatureVerificationState(input.signatureVerificationState, state);
  return {
    plaintext: signed ? signed.content : input.plaintext,
    signatureVerificationState,
    hasVerifiedSignature: signatureVerificationState === "verified",
  };
}
