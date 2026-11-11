import type { MailTrustObservedKey } from "./mail-key-continuity";

export const MAIL_PGP_KEY_GENERATION_PROFILE = {
  type: "ecc",
  curve: "curve25519Legacy",
} as const;

type InspectablePublicKey<Key> = {
  isPrivate(): boolean;
  getFingerprint(): string;
  armor(): string;
  update(source: Key): Promise<Key>;
  getEncryptionKey(): Promise<unknown>;
};

export async function inspectMailPublicKey<
  Key extends InspectablePublicKey<Key>,
>(
  input: {
    armoredKey: string;
    knownArmoredKey?: string;
    forEncryption: boolean;
  },
  provider: { readKey: (input: { armoredKey: string }) => Promise<Key> },
): Promise<MailTrustObservedKey> {
  const read = async (armoredKey: string) => {
    if (
      armoredKey.length > 16_384 ||
      !armoredKey.trimStart().startsWith("-----BEGIN PGP PUBLIC KEY BLOCK-----")
    )
      throw new Error("Invalid public mail key.");
    const key = await provider.readKey({ armoredKey });
    if (key.isPrivate()) throw new Error("Invalid public mail key.");
    return key;
  };
  let key = await read(input.armoredKey);
  const fingerprint = key.getFingerprint().toUpperCase();
  if (input.knownArmoredKey) {
    const known = await read(input.knownArmoredKey);
    if (known.getFingerprint().toUpperCase() === fingerprint)
      key = await known.update(key);
  }
  if (input.forEncryption) await key.getEncryptionKey();
  if (key.getFingerprint().toUpperCase() !== fingerprint)
    throw new Error("Invalid public mail key.");
  return { fingerprint, publicKeyArmored: key.armor() };
}
