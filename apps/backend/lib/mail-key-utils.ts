import * as openpgp from "openpgp";

export async function getOpenPgpPublicKeyFingerprint(
  publicKeyArmored: string,
): Promise<string> {
  const key = await openpgp.readKey({ armoredKey: publicKeyArmored });
  return key.getFingerprint().toUpperCase();
}
